'use client';

import React, { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  CreditCard,
  DollarSign,
  Edit3,
  Loader2,
  Plus,
  ShieldCheck,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  ExpiringSubscription,
  SubscriptionCoupon,
  SubscriptionPlan,
  SubscriptionStats,
} from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type PlanFormState = {
  plan_code: string;
  plan_name: string;
  description: string;
  price: number;
  currency: string;
  duration_days: number;
  featuresText: string;
  display_order: number;
  is_active: boolean;
};

type CouponFormState = {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_from: string;
  valid_until: string;
  max_uses?: number;
  usage_limit_per_user?: number;
  applicable_plans: string;
  is_active: boolean;
};

const DEFAULT_PLAN_FORM: PlanFormState = {
  plan_code: '',
  plan_name: '',
  description: '',
  price: 0,
  currency: 'XOF',
  duration_days: 30,
  featuresText: '',
  display_order: 0,
  is_active: true,
};

const DEFAULT_COUPON_FORM: CouponFormState = {
  code: '',
  discount_type: 'percentage',
  discount_value: 10,
  valid_from: new Date().toISOString().slice(0, 16),
  valid_until: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 16),
  applicable_plans: '',
  is_active: true,
};

export function SubscriptionsPage() {
  const queryClient = useQueryClient();

  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantPlanCode, setGrantPlanCode] = useState('');
  const [grantCoupon, setGrantCoupon] = useState('');

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(DEFAULT_PLAN_FORM);

  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<SubscriptionCoupon | null>(null);
  const [couponForm, setCouponForm] = useState<CouponFormState>(DEFAULT_COUPON_FORM);

  const [expiringWindow, setExpiringWindow] = useState(7);

  const plansQuery = useQuery<SubscriptionPlan[]>({
    queryKey: ['subscription-plans'],
    queryFn: () => apiClient.getPlans({ include_inactive: true }),
  });

  const statsQuery = useQuery<SubscriptionStats>({
    queryKey: ['subscription-stats'],
    queryFn: () => apiClient.getSubscriptionStats(),
    refetchInterval: 60000,
  });

  const expiringQuery = useQuery<ExpiringSubscription[]>({
    queryKey: ['expiring-subscriptions', expiringWindow],
    queryFn: () =>
      apiClient.getExpiringSubscriptions({
        days: expiringWindow,
        include_overdue: true,
        limit: 100,
      }),
  });

  const couponsQuery = useQuery<SubscriptionCoupon[]>({
    queryKey: ['subscription-coupons'],
    queryFn: () => apiClient.getCoupons(),
  });

  const grantMutation = useMutation({
    mutationFn: (data: any) => apiClient.grantPremium(data),
    onSuccess: () => {
      toast.success('Abonnement accordé avec succès');
      setGrantDialogOpen(false);
      setGrantUserId('');
      setGrantPlanCode('');
      setGrantCoupon('');
      queryClient.invalidateQueries({ queryKey: ['subscription-stats'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-subscriptions'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Impossible d'accorder l'abonnement");
    },
  });

  const planSaveMutation = useMutation({
    mutationFn: (payload: { plan: PlanFormState; id?: string }) => {
      const { plan, id } = payload;
      const features = plan.featuresText
        .split('\n')
        .map((feature) => feature.trim())
        .filter(Boolean);

      const planPayload = {
        plan_code: plan.plan_code.trim(),
        plan_name: plan.plan_name.trim(),
        description: plan.description.trim() || null,
        price: Number(plan.price),
        currency: plan.currency,
        duration_days: Number(plan.duration_days),
        features,
        display_order: Number(plan.display_order),
        is_active: plan.is_active,
      };

      if (id) {
        const { plan_code, ...rest } = planPayload;
        return apiClient.updatePlan(id, rest);
      }
      return apiClient.createPlan(planPayload);
    },
    onSuccess: () => {
      toast.success('Plan sauvegardé');
      setPlanDialogOpen(false);
      setPlanForm(DEFAULT_PLAN_FORM);
      setEditingPlan(null);
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Enregistrement impossible');
    },
  });

  const planDeleteMutation = useMutation({
    mutationFn: (planId: string) => apiClient.deletePlan(planId),
    onSuccess: () => {
      toast.success('Plan désactivé');
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Impossible de désactiver');
    },
  });

  const couponSaveMutation = useMutation({
    mutationFn: (payload: { coupon: CouponFormState; id?: string }) => {
      const { coupon, id } = payload;
      const applicablePlans = coupon.applicable_plans
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean);

      const basePayload = {
        code: coupon.code.trim().toUpperCase(),
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
        valid_from: new Date(coupon.valid_from).toISOString(),
        valid_until: new Date(coupon.valid_until).toISOString(),
        max_uses: coupon.max_uses ? Number(coupon.max_uses) : null,
        usage_limit_per_user: coupon.usage_limit_per_user
          ? Number(coupon.usage_limit_per_user)
          : null,
        applicable_plans: applicablePlans.length ? applicablePlans : null,
        is_active: coupon.is_active,
      };

      if (id) {
        const { code, ...rest } = basePayload;
        return apiClient.updateCoupon(id, rest);
      }
      return apiClient.createCoupon(basePayload);
    },
    onSuccess: () => {
      toast.success('Coupon sauvegardé');
      setCouponDialogOpen(false);
      setCouponForm(DEFAULT_COUPON_FORM);
      setEditingCoupon(null);
      queryClient.invalidateQueries({ queryKey: ['subscription-coupons'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Enregistrement impossible');
    },
  });

  const handleOpenPlanDialog = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        plan_code: plan.plan_code,
        plan_name: plan.plan_name,
        description: plan.description ?? '',
        price: plan.price,
        currency: plan.currency,
        duration_days: plan.duration_days,
        featuresText: (plan.features || []).join('\n'),
        display_order: plan.display_order ?? 0,
        is_active: plan.is_active,
      });
    } else {
      setEditingPlan(null);
      setPlanForm(DEFAULT_PLAN_FORM);
    }
    setPlanDialogOpen(true);
  };

  const handleOpenCouponDialog = (coupon?: SubscriptionCoupon) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setCouponForm({
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        valid_from: coupon.valid_from.slice(0, 16),
        valid_until: coupon.valid_until.slice(0, 16),
        max_uses: coupon.max_uses ?? undefined,
        usage_limit_per_user: coupon.usage_limit_per_user ?? undefined,
        applicable_plans: (coupon.applicable_plans || []).join(', '),
        is_active: coupon.is_active,
      });
    } else {
      setEditingCoupon(null);
      setCouponForm(DEFAULT_COUPON_FORM);
    }
    setCouponDialogOpen(true);
  };

  const handleGrantSubmit = () => {
    if (!grantUserId || !grantPlanCode) {
      toast.error('Remplir utilisateur et plan');
      return;
    }

    grantMutation.mutate({
      user_id: grantUserId,
      plan_code: grantPlanCode,
      coupon_code: grantCoupon || undefined,
      payment_method: 'manual',
      reason: 'Accordé via back-office',
    });
  };

  const handleRenew = (expiring: ExpiringSubscription) => {
    setGrantUserId(expiring.user_id);
    setGrantPlanCode(expiring.subscription_tier);
    setGrantCoupon('');
    setGrantDialogOpen(true);
  };

  const plans = plansQuery.data ?? [];
  const activePlans = plans.filter((plan) => plan.is_active);
  const coupons = couponsQuery.data ?? [];
  const expiringUsers = expiringQuery.data ?? [];

  const stats = statsQuery.data;

  const upcomingCount = expiringUsers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Abonnements</h1>
          <p className="text-muted-foreground">
            Surveillez vos revenus récurrents, gérez vos plans et vos remises.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleOpenPlanDialog()}>
            <Plus className="h-4 w-4 mr-2" /> Nouveau plan
          </Button>
          <Button variant="outline" onClick={() => handleOpenCouponDialog()}>
            <Tag className="h-4 w-4 mr-2" /> Nouveau coupon
          </Button>
          <Button onClick={() => setGrantDialogOpen(true)}>
            <CreditCard className="h-4 w-4 mr-2" /> Accorder Premium
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Vue générale</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="expiring">Expirations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Utilisateurs totaux</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total_users ?? '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Premium actifs</CardTitle>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total_premium ?? '—'}</div>
                <p className="text-xs text-muted-foreground">
                  {activePlans.length} plan(s) actifs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">MRR estimé</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.mrr ?? 0)}</div>
                <p className="text-xs text-muted-foreground">Somme des plans premium actifs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Expirent (7 jours)</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.expiring_7days ?? '—'}</div>
                <p className="text-xs text-muted-foreground">Dont {stats?.expiring_3days ?? '—'} sous 3 jours</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{plan.plan_name}</CardTitle>
                    <CardDescription>{plan.description || '—'}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenPlanDialog(plan)}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    {plan.is_active && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => planDeleteMutation.mutate(plan.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-3xl font-bold">
                      {formatCurrency(plan.price, plan.currency)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {plan.duration_days} jours • Ordre #{plan.display_order}
                    </p>
                  </div>
                  {plan.features?.length ? (
                    <ul className="space-y-1 text-sm list-disc list-inside text-muted-foreground">
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>{feature}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pas de fonctionnalités listées</p>
                  )}
                  <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                    {plan.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-6 space-y-4">
          {coupons.length ? (
            <div className="space-y-3">
              {coupons.map((coupon) => (
                <Card key={coupon.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Badge variant={coupon.is_active ? 'default' : 'secondary'}>
                          {coupon.code}
                        </Badge>
                        {coupon.discount_type === 'percentage'
                          ? `${coupon.discount_value}%`
                          : formatCurrency(coupon.discount_value)}
                      </CardTitle>
                      <CardDescription>
                        Valide du {formatDate(coupon.valid_from)} au {formatDate(coupon.valid_until)}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleOpenCouponDialog(coupon)}
                    >
                      Modifier
                    </Button>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Utilisations totales</p>
                      <p className="font-medium">{coupon.usage_count ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Max utilisations</p>
                      <p className="font-medium">{coupon.max_uses ?? 'Illimité'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Limite par utilisateur</p>
                      <p className="font-medium">{coupon.usage_limit_per_user ?? 'Illimitée'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Plans ciblés</p>
                      <p className="font-medium">
                        {(coupon.applicable_plans || []).length
                          ? (coupon.applicable_plans || []).join(', ')
                          : 'Tous'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Aucun coupon défini pour le moment.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="expiring" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm text-muted-foreground">Période</Label>
            <Select
              value={String(expiringWindow)}
              onValueChange={(value) => setExpiringWindow(Number(value))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 jours</SelectItem>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="14">14 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Abonnements expirant</CardTitle>
                <CardDescription>
                  {upcomingCount} utilisateur(s) arrivent à échéance dans les {expiringWindow} prochains jours.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
                </div>
              ) : expiringUsers.length ? (
                expiringUsers.map((expiring) => (
                  <div
                    key={`${expiring.user_id}-${expiring.premium_until}`}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border rounded-lg p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {expiring.first_name} {expiring.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {expiring.email || 'Email inconnu'} — {expiring.subscription_tier}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Expire le {formatDate(expiring.premium_until)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRenew(expiring)}
                    >
                      Renouveler
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Aucun abonnement à échéance sur cette période.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grant dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accorder un abonnement Premium</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID utilisateur</Label>
              <Input
                placeholder="usr_xxx"
                value={grantUserId}
                onChange={(e) => setGrantUserId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={grantPlanCode} onValueChange={setGrantPlanCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un plan" />
                </SelectTrigger>
                <SelectContent>
                  {activePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.plan_code}>
                      {plan.plan_name} — {formatCurrency(plan.price, plan.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Code coupon (optionnel)</Label>
              <Input
                placeholder="PROMO2024"
                value={grantCoupon}
                onChange={(e) => setGrantCoupon(e.target.value.trim())}
              />
            </div>
            <Button onClick={handleGrantSubmit} disabled={grantMutation.isPending}>
              {grantMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Attribution...
                </>
              ) : (
                'Accorder'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? 'Modifier le plan' : 'Créer un plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Code plan</Label>
              <Input
                value={planForm.plan_code}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, plan_code: e.target.value }))
                }
                disabled={Boolean(editingPlan)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={planForm.plan_name}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, plan_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Prix</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={planForm.price}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, price: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Devise</Label>
              <Input
                value={planForm.currency}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Durée (jours)</Label>
              <Input
                type="number"
                min={1}
                value={planForm.duration_days}
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, duration_days: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Ordre d'affichage</Label>
              <Input
                type="number"
                value={planForm.display_order}
                onChange={(e) =>
                  setPlanForm((prev) => ({ ...prev, display_order: Number(e.target.value) }))
                }
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea
                value={planForm.description}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Fonctionnalités (une par ligne)</Label>
              <Textarea
                value={planForm.featuresText}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, featuresText: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Disponibilité</Label>
              <Select
                value={planForm.is_active ? 'true' : 'false'}
                onValueChange={(value) =>
                  setPlanForm((prev) => ({ ...prev, is_active: value === 'true' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Actif</SelectItem>
                  <SelectItem value="false">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPlanDialogOpen(false);
                setEditingPlan(null);
              }}
            >
              Annuler
            </Button>
            <Button onClick={() => planSaveMutation.mutate({ plan: planForm, id: editingPlan?.id })}>
              {planSaveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Coupon dialog */}
      <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCoupon ? 'Modifier le coupon' : 'Créer un coupon'}</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={couponForm.code}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, code: e.target.value }))}
                disabled={Boolean(editingCoupon)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type de remise</Label>
              <Select
                value={couponForm.discount_type}
                onValueChange={(value) =>
                  setCouponForm((prev) => ({ ...prev, discount_type: value as CouponFormState['discount_type'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Pourcentage</SelectItem>
                  <SelectItem value="fixed">Montant fixe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valeur</Label>
              <Input
                type="number"
                min={0}
                value={couponForm.discount_value}
                onChange={(e) =>
                  setCouponForm((prev) => ({ ...prev, discount_value: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max utilisations</Label>
              <Input
                type="number"
                min={0}
                value={couponForm.max_uses ?? ''}
                onChange={(e) =>
                  setCouponForm((prev) => ({
                    ...prev,
                    max_uses: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Limite par utilisateur</Label>
              <Input
                type="number"
                min={0}
                value={couponForm.usage_limit_per_user ?? ''}
                onChange={(e) =>
                  setCouponForm((prev) => ({
                    ...prev,
                    usage_limit_per_user: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Plans concernés (codes séparés par des virgules)</Label>
              <Input
                value={couponForm.applicable_plans}
                onChange={(e) =>
                  setCouponForm((prev) => ({ ...prev, applicable_plans: e.target.value }))
                }
                placeholder="PREMIUM, BUSINESS"
              />
            </div>
            <div className="space-y-2">
              <Label>Début de validité</Label>
              <Input
                type="datetime-local"
                value={couponForm.valid_from}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, valid_from: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fin de validité</Label>
              <Input
                type="datetime-local"
                value={couponForm.valid_until}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, valid_until: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select
                value={couponForm.is_active ? 'true' : 'false'}
                onValueChange={(value) =>
                  setCouponForm((prev) => ({ ...prev, is_active: value === 'true' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Actif</SelectItem>
                  <SelectItem value="false">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCouponDialogOpen(false);
                setEditingCoupon(null);
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={() =>
                couponSaveMutation.mutate({ coupon: couponForm, id: editingCoupon?.id })
              }
            >
              {couponSaveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
