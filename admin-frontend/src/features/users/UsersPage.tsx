'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertTriangle,
  Copy,
  Download,
  Loader2,
  LogIn,
  MoreVertical,
  Search,
  Shield,
  Sparkles,
  Tag,
  Target,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import {
  PaginatedResponse,
  User,
  UserSegment,
  UserTag,
  SubscriptionHistory,
} from '@/types';
import { toast } from 'sonner';

type UserDetail = {
  profile: User;
  auth_user?: {
    email: string;
    last_sign_in_at?: string;
  };
  entrepreneur_profile?: any;
  subscription_history: SubscriptionHistory[];
  tags: UserTag[];
  custom_fields: any[];
  segments: UserSegment[];
  activity: any[];
  impersonation_sessions: any[];
};

const LIMIT_OPTIONS = [25, 50, 100, 500];

export function UsersPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [isPremiumFilter, setIsPremiumFilter] = useState<string>('all');
  const [isBlockedFilter, setIsBlockedFilter] = useState<string>('all');
  const [limit, setLimit] = useState<number>(50);

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userDetails, setUserDetails] = useState<UserDetail | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [impersonationData, setImpersonationData] = useState<{
    token: string;
    expires_at: string;
  } | null>(null);

  const usersQuery = useInfiniteQuery<PaginatedResponse<User>>({
    queryKey: ['users', search, isPremiumFilter, isBlockedFilter, limit],
    queryFn: ({ pageParam = null }) =>
      apiClient.getUsers({
        search: search || undefined,
        is_premium: isPremiumFilter === 'all' ? undefined : isPremiumFilter === 'true',
        is_blocked: isBlockedFilter === 'all' ? undefined : isBlockedFilter === 'true',
        limit,
        cursor: pageParam ?? undefined,
    }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: null,
  });

  const segmentsQuery = useQuery({
    queryKey: ['user-segments'],
    queryFn: () => apiClient.getUserSegments(),
  });

  const createSegmentMutation = useMutation({
    mutationFn: (payload: any) => apiClient.createUserSegment(payload),
    onSuccess: () => {
      toast.success('Segment enregistré');
      queryClient.invalidateQueries({ queryKey: ['user-segments'] });
    },
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: (segmentId: string) => apiClient.deleteUserSegment(segmentId),
    onSuccess: () => {
      toast.success('Segment supprimé');
      queryClient.invalidateQueries({ queryKey: ['user-segments'] });
    },
  });

  const users = useMemo(
    () => usersQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [usersQuery.data],
  );

  const summary = usersQuery.data?.pages[0]?.summary ?? {};

  const isLoading = usersQuery.isLoading;
  const isFetching = usersQuery.isFetching;
  const isFetchingNextPage = usersQuery.isFetchingNextPage;
  const hasNextPage = usersQuery.hasNextPage;

  useEffect(() => {
    const availableIds = new Set(users.map((user) => user.user_id));
    setSelectedUserIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [users]);

  const toggleAll = () => {
    if (!users.length) return;
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map((user) => user.user_id));
    }
  };

  const toggleSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const resetSelection = () => setSelectedUserIds([]);

  const handleExportCSV = async () => {
    try {
      const blob = await apiClient.exportUsersCSV({
        search: search || undefined,
        is_premium: isPremiumFilter === 'all' ? undefined : isPremiumFilter === 'true',
        is_blocked: isBlockedFilter === 'all' ? undefined : isBlockedFilter === 'true',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export CSV lancé');
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  const handleBulkAction = async (action: string, params?: any) => {
    if (!selectedUserIds.length) {
      toast.error('Sélectionnez au moins un utilisateur');
      return;
    }

    try {
      await apiClient.bulkUserAction(selectedUserIds, action, params);
      toast.success('Action groupée effectuée');
      resetSelection();
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la mise à jour');
    }
  };

  const handleViewUser = async (userId: string) => {
    try {
      const details = await apiClient.getUser(userId);
      setUserDetails(details);
      setShowUserDialog(true);
    } catch (error) {
      toast.error("Erreur lors du chargement de l'utilisateur");
    }
  };

  const handleStartImpersonation = async (userId: string) => {
    try {
      const result = await apiClient.startImpersonation(userId);
      setImpersonationData({
        token: result.token,
        expires_at: result.expires_at,
      });
      toast.success('Token généré');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Impossible de générer le token");
    }
  };

  const handleApplySegmentFilters = (filters: Record<string, any>) => {
    setSearch(filters.search ?? '');
    if (filters.is_premium === true) setIsPremiumFilter('true');
    else if (filters.is_premium === false) setIsPremiumFilter('false');
    else setIsPremiumFilter('all');

    if (filters.is_blocked === true) setIsBlockedFilter('true');
    else if (filters.is_blocked === false) setIsBlockedFilter('false');
    else setIsBlockedFilter('all');

    resetSelection();
  };

  const handleSaveSegment = () => {
    const name = window.prompt('Nom du segment');
    if (!name) return;

    const description = window.prompt('Description (optionnel)') ?? undefined;
    const payload = {
      name,
      description,
      filters: {
        search: search || undefined,
        is_premium: isPremiumFilter === 'all' ? undefined : isPremiumFilter === 'true',
        is_blocked: isBlockedFilter === 'all' ? undefined : isBlockedFilter === 'true',
      },
      is_shared: false,
    };
    createSegmentMutation.mutate(payload);
  };

  const handleDeleteSegment = (segmentId: string) => {
    deleteSegmentMutation.mutate(segmentId);
  };

  const handleAssignSegment = async (segmentId: string) => {
    await handleBulkAction('segment_add', { segment_id: segmentId });
  };

  const handleRemoveSegment = async (segmentId: string) => {
    await handleBulkAction('segment_remove', { segment_id: segmentId });
  };

  const handleCopyToken = async () => {
    if (!impersonationData?.token) return;
    try {
      await navigator.clipboard.writeText(impersonationData.token);
      toast.success('Token copié dans le presse-papier');
    } catch {
      toast.error('Impossible de copier le token');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Utilisateurs</h1>
          <p className="text-muted-foreground">
            Gérer les utilisateurs, leurs accès et actions administratives.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveSegment}>
            <Target className="mr-2 h-4 w-4" />
            Enregistrer ce filtre
          </Button>
          <Button onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Exporter CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={isPremiumFilter} onValueChange={setIsPremiumFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Type d'abonnement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les abonnements</SelectItem>
                <SelectItem value="true">Premium</SelectItem>
                <SelectItem value="false">Gratuit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={isBlockedFilter} onValueChange={setIsBlockedFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="false">Actifs</SelectItem>
                <SelectItem value="true">Bloqués</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm text-muted-foreground">Résultats par page</Label>
            <Select
              value={String(limit)}
              onValueChange={(value) => setLimit(Number(value))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.overall_total ?? '—'}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.filtered_total ?? 0} dans la vue actuelle
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.premium_total ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloqués</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.blocked_total ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profils complétés</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.with_profile_total ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MoreVertical className="h-4 w-4" />
            Actions groupées
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={!selectedUserIds.length}
            onClick={() => handleBulkAction('block', { reason: 'Blocked by admin' })}
          >
            Bloquer
          </Button>
          <Button
            variant="outline"
            disabled={!selectedUserIds.length}
            onClick={() => handleBulkAction('unblock')}
          >
            Débloquer
          </Button>
          <Button
            variant="outline"
            disabled={!selectedUserIds.length}
            onClick={async () => {
              const tag = window.prompt('Nom du tag');
              if (!tag) return;
              const color = window.prompt('Couleur hex (optionnel)') ?? '#3B82F6';
              await handleBulkAction('tag', { tag, color });
            }}
          >
            <Tag className="mr-2 h-4 w-4" />
            Ajouter tag
          </Button>
          <Button
            variant="outline"
            disabled={!selectedUserIds.length}
            onClick={async () => {
              const tag = window.prompt('Nom du tag à retirer');
              if (!tag) return;
              await handleBulkAction('untag', { tag });
            }}
          >
            Retirer tag
          </Button>
          <Button
            variant="outline"
            disabled={!selectedUserIds.length || !segmentsQuery.data?.length}
            onClick={async () => {
              if (!segmentsQuery.data?.length) return;
              const segmentName = window.prompt(
                'Segment cible (entrez exactement le nom affiché dans la liste)',
              );
              if (!segmentName) return;
              const segment = segmentsQuery.data.find(
                (seg: UserSegment & { name: string }) =>
                  seg.name?.toLowerCase() === segmentName.toLowerCase(),
              );
              if (!segment) {
                toast.error('Segment introuvable');
                return;
              }
              await handleAssignSegment(segment.id);
            }}
          >
            <Target className="mr-2 h-4 w-4" />
            Ajouter au segment
          </Button>
        </CardContent>
      </Card>

      {/* Users list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Liste des utilisateurs</CardTitle>
          <div className="text-sm text-muted-foreground">
            {selectedUserIds.length} sélectionné(s)
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/40 rounded-md text-sm">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.length === users.length && users.length > 0}
                    onChange={toggleAll}
                  />
                  <span className="font-medium text-muted-foreground">
                    {users.length} résultats
                  </span>
                </div>
              </div>

              {users.map((user) => {
                const initial = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.trim() ||
                  (user.email?.[0]?.toUpperCase() ?? 'U');

                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.user_id)}
                        onChange={() => toggleSelection(user.user_id)}
                      />
                      <div
                        className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary cursor-pointer"
                        onClick={() => handleViewUser(user.user_id)}
                      >
                        {initial}
                      </div>
                      <div className="flex-1 space-y-1 cursor-pointer" onClick={() => handleViewUser(user.user_id)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {user.first_name} {user.last_name}
                          </p>
                          {user.email && (
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>ID: {user.user_id?.slice(0, 8)}...</span>
                          <span>Créé le {formatDate(user.created_at)}</span>
                          {user.country_code && <span>{user.country_code}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {user.is_premium && <Badge variant="default">Premium</Badge>}
                        {user.is_blocked && <Badge variant="destructive">Bloqué</Badge>}
                        {user.has_profile && (
                          <Badge variant="secondary">Profil complété</Badge>
                        )}
                        {user.tags?.map((tag) => (
                          <Badge
                            key={`${user.user_id}-${tag.tag}`}
                            style={{ background: tag.color ?? '#3B82F6' }}
                          >
                            {tag.tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await apiClient.updateUser(user.user_id, {
                              is_blocked: !user.is_blocked,
                              block_reason: !user.is_blocked ? 'Blocked manually' : undefined,
                            });
                            toast.success(
                              !user.is_blocked
                                ? 'Utilisateur bloqué'
                                : 'Utilisateur débloqué',
                            );
                            await queryClient.invalidateQueries({ queryKey: ['users'] });
                          } catch (error: any) {
                            toast.error(
                              error.response?.data?.detail ||
                                "Impossible de mettre à jour l'utilisateur",
                            );
                          }
                        }}
                      >
                        {user.is_blocked ? 'Débloquer' : 'Bloquer'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartImpersonation(user.user_id)}
                      >
                        <LogIn className="mr-1 h-4 w-4" />
                        Impersoner
                      </Button>
                    </div>
                  </div>
                );
              })}

              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => usersQuery.fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Chargement...
                      </>
                    ) : (
                      'Charger plus'
                    )}
                  </Button>
                </div>
              )}
              {isFetching && !isFetchingNextPage && (
                <div className="flex justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Segments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Segments enregistrés</CardTitle>
            <p className="text-sm text-muted-foreground">
              Appliquez rapidement des filtres sauvegardés ou assignez des utilisateurs.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {segmentsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des segments...
            </div>
          ) : segmentsQuery.data?.length ? (
            segmentsQuery.data.map((segment: any) => (
              <div
                key={segment.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-lg p-3"
              >
                <div>
                  <p className="font-medium">{segment.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {segment.description || 'Sans description'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleApplySegmentFilters(segment.filters ?? {})}
                  >
                    <Target className="mr-2 h-4 w-4" />
                    Appliquer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!selectedUserIds.length}
                    onClick={() => handleAssignSegment(segment.id)}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    Ajouter sélection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!selectedUserIds.length}
                    onClick={() => handleRemoveSegment(segment.id)}
                  >
                    Retirer sélection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDeleteSegment(segment.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun segment enregistré pour le moment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* User detail dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Détails utilisateur</DialogTitle>
          </DialogHeader>

          {userDetails ? (
            <Tabs defaultValue="profile" className="mt-4">
              <TabsList>
                <TabsTrigger value="profile">Profil</TabsTrigger>
                <TabsTrigger value="subscription">Abonnement</TabsTrigger>
                <TabsTrigger value="activity">Activité</TabsTrigger>
              </TabsList>

              <TabsContent value="profile">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nom</Label>
                    <p className="text-sm font-medium">
                      {userDetails.profile.first_name} {userDetails.profile.last_name}
                    </p>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <p className="text-sm font-medium">
                      {userDetails.auth_user?.email || userDetails.profile.email || '—'}
                    </p>
                  </div>
                  <div>
                    <Label>ID utilisateur</Label>
                    <p className="text-sm font-medium">{userDetails.profile.user_id}</p>
                  </div>
                  <div>
                    <Label>Statut</Label>
                    <div className="flex flex-wrap gap-2">
                      {userDetails.profile.is_premium && <Badge>Premium</Badge>}
                      {userDetails.profile.is_blocked && (
                        <Badge variant="destructive">Bloqué</Badge>
                      )}
                      {userDetails.profile.has_profile && (
                        <Badge variant="secondary">Profil complété</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Créé le</Label>
                    <p className="text-sm font-medium">{formatDate(userDetails.profile.created_at)}</p>
                  </div>
                  <div>
                    <Label>Dernière connexion</Label>
                    <p className="text-sm font-medium">
                      {userDetails.profile.last_login
                        ? formatDate(userDetails.profile.last_login)
                        : 'Jamais'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {userDetails.tags.length ? (
                        userDetails.tags.map((tag) => (
                          <Badge key={tag.tag} style={{ background: tag.color ?? '#3B82F6' }}>
                            {tag.tag}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucun tag</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Segments</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {userDetails.segments.length ? (
                        userDetails.segments.map((segment) => (
                          <Badge key={segment.id} variant="outline">
                            {segment.name || segment.id}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Aucun segment</p>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="subscription">
                <div className="space-y-3">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <Label>Type d'abonnement</Label>
                      <p className="text-sm font-medium">
                        {userDetails.profile.subscription_tier ?? 'Gratuit'}
                      </p>
                    </div>
                    <div>
                      <Label>Premium jusqu'à</Label>
                      <p className="text-sm font-medium">
                        {userDetails.profile.premium_until
                          ? formatDate(userDetails.profile.premium_until)
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <Label>Historique</Label>
                      <p className="text-sm text-muted-foreground">
                        {userDetails.subscription_history.length} évènement(s)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {userDetails.subscription_history.length ? (
                      userDetails.subscription_history.map((history) => (
                        <div
                          key={history.id}
                          className="flex items-center justify-between border rounded-lg p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">{history.action}</p>
                            <p className="text-muted-foreground">
                              {history.plan || 'Plan personnalisé'} • {formatDate(history.created_at)}
                            </p>
                          </div>
                          {history.amount && (
                            <span className="text-sm font-medium">
                              {formatCurrency(history.amount)}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Aucun historique disponible.
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Dernières activités administratives & connexions.
                  </div>
                  {userDetails.activity.length ? (
                    userDetails.activity.map((log) => (
                      <div key={log.id} className="border rounded-lg p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{log.event_type}</span>
                          <Badge variant="outline">{log.severity}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 text-muted-foreground">
                          <span>{formatDate(log.created_at)}</span>
                          {log.admin_id && <span>Admin: {log.admin_id.slice(0, 8)}...</span>}
                        </div>
                        {log.metadata && (
                          <pre className="bg-muted p-2 rounded-md text-xs overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucune activité enregistrée pour cet utilisateur.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Impersonation token dialog */}
      <Dialog open={Boolean(impersonationData)} onOpenChange={(open) => !open && setImpersonationData(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Token d'impersonation généré</DialogTitle>
          </DialogHeader>
          {impersonationData && (
            <div className="space-y-4">
              <div>
                <Label>Token JWT</Label>
                <div className="mt-1 bg-muted rounded-md p-3 text-xs break-all">
                  {impersonationData.token}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={handleCopyToken}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copier
                </Button>
              </div>
              <div>
                <Label>Expiration</Label>
                <p className="text-sm">
                  {formatDate(impersonationData.expires_at)} (UTC)
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Utilisez ce token sur la plateforme publique pour vous connecter en tant que l'utilisateur ciblé.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
