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
  AlertTriangle,
  Calendar,
  ClipboardList,
  Loader2,
  Mail,
  Rocket,
  Send,
  Trash2,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  CampaignOverviewStats,
  CampaignTemplate,
  EmailCampaign,
  CampaignStats,
} from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type CampaignFormState = {
  name: string;
  subject: string;
  content: string;
  targeting_type: 'all' | 'segment' | 'premium' | 'country';
  country_code: string;
  segmentFilters: string;
  template_id: string;
  scheduled_for: string;
};

const DEFAULT_CAMPAIGN_FORM: CampaignFormState = {
  name: '',
  subject: '',
  content: '',
  targeting_type: 'all',
  country_code: '',
  segmentFilters: '',
  template_id: '',
  scheduled_for: '',
};

export function CampaignsPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'scheduled' | 'sent' | 'failed'>(
    'all',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(DEFAULT_CAMPAIGN_FORM);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    subject: '',
    description: '',
    category: '',
    content: '',
  });

  const campaignsQuery = useQuery<EmailCampaign[]>({
    queryKey: ['campaigns', statusFilter],
    queryFn: () =>
      apiClient.getCampaigns({
        status_filter: statusFilter === 'all' ? undefined : statusFilter,
      }),
  });

  const overviewQuery = useQuery<CampaignOverviewStats>({
    queryKey: ['campaign-overview'],
    queryFn: () => apiClient.getCampaignOverview(),
    refetchInterval: 60000,
  });

  const templatesQuery = useQuery<CampaignTemplate[]>({
    queryKey: ['campaign-templates'],
    queryFn: () => apiClient.getCampaignTemplates(),
  });

  const campaignDetailQuery = useQuery<{ campaign: EmailCampaign; stats?: CampaignStats } | null>({
    queryKey: ['campaign-detail', selectedCampaignId],
    queryFn: () => (selectedCampaignId ? apiClient.getCampaign(selectedCampaignId) : null),
    enabled: Boolean(selectedCampaignId),
  });

  const createCampaignMutation = useMutation({
    mutationFn: (payload: any) => apiClient.createCampaign(payload),
    onSuccess: () => {
      toast.success('Campagne créée');
      setCampaignDialogOpen(false);
      setCampaignForm(DEFAULT_CAMPAIGN_FORM);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-overview'] });
      if (selectedCampaignId) {
        queryClient.invalidateQueries({ queryKey: ['campaign-detail', selectedCampaignId] });
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Impossible de créer la campagne');
    },
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (payload: { id: string; data: any }) =>
      apiClient.sendCampaign(payload.id, payload.data),
    onSuccess: () => {
      toast.success('Campagne envoyée');
      setTestEmail('');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-overview'] });
      if (selectedCampaignId) {
        queryClient.invalidateQueries({ queryKey: ['campaign-detail', selectedCampaignId] });
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Envoi impossible");
    },
  });

  const scheduleCampaignMutation = useMutation({
    mutationFn: (payload: { id: string; scheduled_for: string }) =>
      apiClient.scheduleCampaign(payload.id, { scheduled_for: payload.scheduled_for }),
    onSuccess: () => {
      toast.success('Campagne planifiée');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-overview'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Planification impossible");
    },
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => apiClient.cancelCampaign(campaignId),
    onSuccess: () => {
      toast.success('Campagne rebasculée en brouillon');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-overview'] });
      if (selectedCampaignId) {
        queryClient.invalidateQueries({ queryKey: ['campaign-detail', selectedCampaignId] });
      }
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: (payload: any) => apiClient.createCampaignTemplate(payload),
    onSuccess: () => {
      toast.success('Modèle créé');
      setTemplateDialogOpen(false);
      setNewTemplate({ name: '', subject: '', description: '', category: '', content: '' });
      queryClient.invalidateQueries({ queryKey: ['campaign-templates'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Impossible de créer le modèle');
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => apiClient.deleteCampaignTemplate(templateId),
    onSuccess: () => {
      toast.success('Modèle supprimé');
      queryClient.invalidateQueries({ queryKey: ['campaign-templates'] });
    },
  });

  const filteredCampaigns = useMemo(() => {
    if (!campaignsQuery.data) return [];
    if (!searchTerm) return campaignsQuery.data;
    const needle = searchTerm.toLowerCase();
    return campaignsQuery.data.filter((campaign) =>
      campaign.name.toLowerCase().includes(needle) ||
      campaign.subject.toLowerCase().includes(needle),
    );
  }, [campaignsQuery.data, searchTerm]);

  const openCreateDialog = () => {
    setCampaignForm(DEFAULT_CAMPAIGN_FORM);
    setSelectedCampaignId(null);
    setCampaignDialogOpen(true);
  };

  const handleCreateCampaign = () => {
    if (!campaignForm.name || !campaignForm.subject || !campaignForm.content) {
      toast.error('Champs nom, sujet et contenu obligatoires');
      return;
    }

    let targeting_filters: any = undefined;
    if (campaignForm.targeting_type === 'country') {
      if (!campaignForm.country_code) {
        toast.error('Précisez un code pays (ex: SN)');
        return;
      }
      targeting_filters = { country_code: campaignForm.country_code.toUpperCase() };
    }
    if (campaignForm.targeting_type === 'segment' && campaignForm.segmentFilters) {
      try {
        targeting_filters = JSON.parse(campaignForm.segmentFilters);
      } catch (error) {
        toast.error('Filtres segment invalides (JSON)');
        return;
      }
    }

    createCampaignMutation.mutate({
      name: campaignForm.name,
      subject: campaignForm.subject,
      content: campaignForm.content,
      targeting_type: campaignForm.targeting_type,
      targeting_filters,
      scheduled_for: campaignForm.scheduled_for ? new Date(campaignForm.scheduled_for) : undefined,
      template_id: campaignForm.template_id || undefined,
    });
  };

  const handleSendCampaign = (mode: 'test' | 'live') => {
    if (!selectedCampaignId) return;
    if (mode === 'test') {
      if (!testEmail) {
        toast.error('Indiquez un email de test');
        return;
      }
      sendCampaignMutation.mutate({ id: selectedCampaignId, data: { test_email: testEmail } });
      return;
    }
    sendCampaignMutation.mutate({ id: selectedCampaignId, data: {} });
  };

  const campaigns = filteredCampaigns;
  const overview = overviewQuery.data;
  const selectedCampaign = campaignDetailQuery.data?.campaign;
  const selectedStats = campaignDetailQuery.data?.stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Campagnes e-mail</h1>
          <p className="text-muted-foreground">
            Orchestration complète de vos newsletters et communications ciblées.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Rechercher une campagne"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
            <ClipboardList className="h-4 w-4 mr-2" /> Modèle
          </Button>
          <Button onClick={openCreateDialog}>
            <Mail className="h-4 w-4 mr-2" /> Nouvelle campagne
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campagnes totales</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.total_campaigns ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Envoyées</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.sent_campaigns ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planifiées</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.scheduled_campaigns ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails envoyés</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.emails_sent ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="draft">Brouillons</TabsTrigger>
          <TabsTrigger value="scheduled">Planifiées</TabsTrigger>
          <TabsTrigger value="sent">Envoyées</TabsTrigger>
          <TabsTrigger value="failed">Échouées</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campagnes</CardTitle>
              <CardDescription>
                {campaignsQuery.isLoading ? 'Chargement...' : `${campaigns.length} campagne(s)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaignsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : campaigns.length ? (
                <div className="space-y-2">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-lg p-4 hover:bg-accent transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedCampaignId(campaign.id);
                        setScheduleDate('');
                        setTestEmail('');
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{campaign.name}</p>
                          <Badge variant="outline">{campaign.targeting_type}</Badge>
                          <Badge
                            variant={
                              campaign.status === 'sent'
                                ? 'default'
                                : campaign.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {campaign.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                        <div className="text-xs text-muted-foreground mt-1">
                          Créée {formatDate(campaign.created_at)} • Destinataires {campaign.recipient_count}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {campaign.status === 'scheduled' && campaign.scheduled_for
                          ? `Planifiée le ${formatDate(campaign.scheduled_for)}`
                          : campaign.sent_at
                          ? `Envoyée le ${formatDate(campaign.sent_at)}`
                          : 'Non envoyée'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Aucune campagne trouvée pour ce filtre.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedCampaign && (
        <Dialog open={Boolean(selectedCampaign)} onOpenChange={() => setSelectedCampaignId(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Détails de la campagne</DialogTitle>
              <CardDescription>{selectedCampaign.name}</CardDescription>
            </DialogHeader>
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{selectedCampaign.subject}</CardTitle>
                  <CardDescription>Statut : {selectedCampaign.status}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div dangerouslySetInnerHTML={{ __html: selectedCampaign.content }} />
                  {selectedCampaign.error_message && (
                    <div className="text-destructive">Erreur : {selectedCampaign.error_message}</div>
                  )}
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Destinataires estimés</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedCampaign.recipient_count}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Planification</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm">
                      {selectedCampaign.scheduled_for
                        ? formatDate(selectedCampaign.scheduled_for)
                        : 'Non planifiée'}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Statistiques</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      <div>Envoyés : {selectedStats?.total_sent ?? 0}</div>
                      <div>Ouverts : {selectedStats?.total_opened ?? 0}</div>
                      <div>Cliqués : {selectedStats?.total_clicked ?? 0}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <Label>Email test</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    className="md:w-72"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleSendCampaign('test')}
                    disabled={sendCampaignMutation.isPending}
                  >
                    Envoyer un test
                  </Button>
                  <Button
                    onClick={() => handleSendCampaign('live')}
                    disabled={sendCampaignMutation.isPending}
                  >
                    {sendCampaignMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Lancer la campagne
                  </Button>
                </div>
              </div>

              {(selectedCampaign.status === 'draft' || selectedCampaign.status === 'scheduled') && (
                <div className="space-y-2">
                  <Label>Planifier un envoi</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!scheduleDate) {
                          toast.error('Choisissez une date');
                          return;
                        }
                        scheduleCampaignMutation.mutate({
                          id: selectedCampaign.id,
                          scheduled_for: scheduleDate,
                        });
                      }}
                      disabled={scheduleCampaignMutation.isPending}
                    >
                      {scheduleCampaignMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Calendar className="h-4 w-4 mr-2" />
                      )}
                      Planifier
                    </Button>
                  </div>
                </div>
              )}

              {selectedCampaign.status === 'scheduled' ? (
                <Button
                  variant="outline"
                  onClick={() => cancelCampaignMutation.mutate(selectedCampaign.id)}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" /> Annuler la planification
                </Button>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create campaign dialog */}
      <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nom de la campagne</Label>
              <Input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Sujet</Label>
              <Input
                value={campaignForm.subject}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ciblage</Label>
              <Select
                value={campaignForm.targeting_type}
                onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, targeting_type: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les utilisateurs</SelectItem>
                  <SelectItem value="premium">Premium uniquement</SelectItem>
                  <SelectItem value="country">Par pays</SelectItem>
                  <SelectItem value="segment">Filtres personnalisés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modèle (optionnel)</Label>
              <Select
                value={campaignForm.template_id}
                onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, template_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun</SelectItem>
                  {templatesQuery.data?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {campaignForm.targeting_type === 'country' && (
              <div className="space-y-2">
                <Label>Code pays (ISO)</Label>
                <Input
                  placeholder="SN"
                  value={campaignForm.country_code}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, country_code: e.target.value }))}
                />
              </div>
            )}

            {campaignForm.targeting_type === 'segment' && (
              <div className="md:col-span-2 space-y-2">
                <Label>Filtres segment (JSON)</Label>
                <Textarea
                  value={campaignForm.segmentFilters}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, segmentFilters: e.target.value }))}
                  placeholder='{"country_code": "SN"}'
                />
              </div>
            )}

            <div className="md:col-span-2 space-y-2">
              <Label>Contenu HTML</Label>
              <Textarea
                rows={8}
                value={campaignForm.content}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, content: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Planification (optionnel)</Label>
              <Input
                type="datetime-local"
                value={campaignForm.scheduled_for}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, scheduled_for: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCampaignDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateCampaign} disabled={createCampaignMutation.isPending}>
              {createCampaignMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Créer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modèles de campagne</DialogTitle>
            <CardDescription>
              Créez des brouillons réutilisables pour accélérer vos envois.
            </CardDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Catégorie</Label>
                <Input
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate((prev) => ({ ...prev, category: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Sujet</Label>
                <Input
                  value={newTemplate.subject}
                  onChange={(e) => setNewTemplate((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>Contenu HTML</Label>
                <Textarea
                  rows={6}
                  value={newTemplate.content}
                  onChange={(e) => setNewTemplate((prev) => ({ ...prev, content: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
              >
                Fermer
              </Button>
              <Button onClick={() => createTemplateMutation.mutate(newTemplate)}>
                {createTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Enregistrer
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Modèles existants</h3>
              {templatesQuery.data?.length ? (
                templatesQuery.data.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between border rounded-lg p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{template.name}</p>
                      <p className="text-muted-foreground">{template.subject}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteTemplateMutation.mutate(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Aucun modèle enregistré.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
