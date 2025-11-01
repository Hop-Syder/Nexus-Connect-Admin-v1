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
} from '@/components/ui/card';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Clock,
  Loader2,
  MoreVertical,
  Search,
  Sparkles,
  Tag,
  UserCheck,
  Users,
  Wand2,
  XCircle,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { ModerationQueueItem } from '@/types';
import { useAuthStore } from '@/store/auth-store';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type ModerationQueueResponse = {
  data: ModerationQueueItem[];
  meta: {
    count: number;
    filters: Record<string, any>;
  };
};

type ModerationMacro = {
  id: string;
  name: string;
  description?: string;
  decision: string;
  template: string;
  tags?: string[];
  sla_minutes?: number;
};

type ModerationStats = {
  pending_count: number;
  in_review_count: number;
  sla_breaches: number;
  approved_today: number;
  rejected_today: number;
  average_review_time_minutes: number;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'En attente' },
  { value: 'in_review', label: 'En revue' },
  { value: 'approved', label: 'Approuvés' },
  { value: 'rejected', label: 'Rejetés' },
  { value: 'changes_requested', label: 'Modifications demandées' },
];

const DECISION_LABEL: Record<string, string> = {
  approved: 'Approuver',
  rejected: 'Rejeter',
  changes_requested: 'Demander modifications',
};

export function ModerationPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [slaFilter, setSlaFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedQueueItem, setSelectedQueueItem] = useState<ModerationQueueItem | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState<ModerationMacro | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [customReason, setCustomReason] = useState('');

  const queueQuery = useQuery<ModerationQueueResponse>({
    queryKey: [
      'moderation-queue',
      statusFilter,
      priorityFilter,
      slaFilter,
      assignedFilter,
      searchTerm,
    ],
    queryFn: () =>
      apiClient.getModerationQueue({
        status_filter: statusFilter || undefined,
        priority: priorityFilter === 'all' ? undefined : Number(priorityFilter),
        sla_breach:
          slaFilter === 'all' ? undefined : slaFilter === 'sla_breach',
        assigned_to:
          assignedFilter === 'me'
            ? user?.id
            : assignedFilter === 'unassigned'
            ? '__unassigned__'
            : undefined,
        search: searchTerm || undefined,
      }),
    refetchInterval: 30000,
  });

  const statsQuery = useQuery<ModerationStats>({
    queryKey: ['moderation-stats'],
    queryFn: () => apiClient.getModerationStats(),
    refetchInterval: 30000,
  });

  const macrosQuery = useQuery<ModerationMacro[]>({
    queryKey: ['moderation-macros'],
    queryFn: () => apiClient.getModerationMacros(),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: any) => apiClient.assignModerationItem(payload),
    onSuccess: () => {
      toast.success('Dossier assigné');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Impossible d'assigner");
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.moderateEntrepreneur(id, data),
    onSuccess: () => {
      toast.success('Décision enregistrée');
      setShowDetailsDialog(false);
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['moderation-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Erreur de modération');
    },
  });

  const queueItems = queueQuery.data?.data ?? [];

  const filteredQueue = useMemo(() => {
    return queueItems.filter((item) => {
      if (slaFilter === 'sla_ok' && item.sla_breach) {
        return false;
      }
      if (searchTerm) {
        const needle = searchTerm.toLowerCase();
        const company = item.entrepreneur?.company_name?.toLowerCase() ?? '';
        const city = item.entrepreneur?.city?.toLowerCase() ?? '';
        const email = item.entrepreneur?.auth?.email?.toLowerCase() ?? '';
        if (
          !company.includes(needle) &&
          !city.includes(needle) &&
          !email.includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [queueItems, slaFilter, searchTerm]);

  const handleOpenDetails = (item: ModerationQueueItem) => {
    setSelectedQueueItem(item);
    setSelectedMacro(null);
    setDecisionNote('');
    setCustomReason('');
    setShowDetailsDialog(true);
  };

  const handleAssignToMe = () => {
    if (!selectedQueueItem || !user?.id) return;
    assignMutation.mutate({
      queue_id: selectedQueueItem.id,
      moderator_id: user.id,
    });
  };

  const handleApplyMacro = (macro: ModerationMacro) => {
    setSelectedMacro(macro);
    setCustomReason(macro.template || '');
  };

  const handleDecision = (decision: string) => {
    if (!selectedQueueItem) return;
    decisionMutation.mutate({
      id: selectedQueueItem.entrepreneur_id,
      data: {
        decision,
        reason: customReason,
        notes: decisionNote,
        macro_used: selectedMacro?.id,
      },
    });
  };

  const renderStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'destructive' | 'secondary'; icon: React.ElementType; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'En attente' },
      in_review: { variant: 'default', icon: Users, label: 'En revue' },
      approved: { variant: 'default', icon: CheckCircle, label: 'Approuvé' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejeté' },
      changes_requested: { variant: 'default', icon: ClipboardList, label: 'Modifs demandées' },
    };
    const entry = config[status] ?? config.pending;
    const Icon = entry.icon;
    return (
      <Badge variant={entry.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {entry.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Modération</h1>
          <p className="text-muted-foreground">
            Supervisez la file de validation des entrepreneurs, appliquez vos décisions et surveillez les SLA.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher (Entreprise, Email, Ville...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72"
          />
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsQuery.data?.pending_count ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En revue</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsQuery.data?.in_review_count ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA en alerte</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {statsQuery.data?.sla_breaches ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approuvés (24h)</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsQuery.data?.approved_today ?? '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Temps moyen (min)</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsQuery.data?.average_review_time_minutes ?? '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres avancés */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MoreVertical className="h-4 w-4" /> Filtres
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Priorité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes priorités</SelectItem>
              <SelectItem value="3">Haute (3)</SelectItem>
              <SelectItem value="2">Moyenne (2)</SelectItem>
              <SelectItem value="1">Basse (1)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={slaFilter} onValueChange={setSlaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="SLA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="sla_breach">SLA dépassé</SelectItem>
              <SelectItem value="sla_ok">Dans SLA</SelectItem>
            </SelectContent>
          </Select>

          <Select value={assignedFilter} onValueChange={setAssignedFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Assignation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="me">Assignés à moi</SelectItem>
              <SelectItem value="unassigned">Non assignés</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* File */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>File de modération</CardTitle>
          <div className="text-sm text-muted-foreground">
            {queueQuery.data?.meta?.count ?? 0} éléments chargés
          </div>
        </CardHeader>
        <CardContent>
          {queueQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-20 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filteredQueue.length ? (
            <div className="space-y-2">
              {filteredQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border rounded-lg p-4 hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => handleOpenDetails(item)}
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold">
                        {item.entrepreneur?.company_name ||
                          `${item.entrepreneur?.first_name ?? ''} ${item.entrepreneur?.last_name ?? ''}`.trim() ||
                          'Profil sans nom'}
                      </p>
                      {item.entrepreneur?.auth?.email && (
                        <span className="text-xs text-muted-foreground">
                          {item.entrepreneur.auth.email}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Soumis {formatDate(item.submitted_at)}</span>
                      {item.entrepreneur?.city && <span>{item.entrepreneur.city}</span>}
                      {item.time_remaining_minutes !== null && (
                        <span>
                          SLA restant :
                          <span className={item.is_overdue ? 'text-destructive font-medium ml-1' : 'ml-1'}>
                            {item.is_overdue ? `${item.time_remaining_minutes} min` : `${item.time_remaining_minutes} min`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.priority > 0 && (
                      <Badge variant="outline">Priorité {item.priority}</Badge>
                    )}
                    {item.sla_breach && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> SLA
                      </Badge>
                    )}
                    {renderStatusBadge(item.status)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-12">
              Aucun document à modérer sous ce filtre.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Macros */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Macros de décision</CardTitle>
            <p className="text-sm text-muted-foreground">
              Appliquez des modèles de réponse et des décisions standardisées.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const name = window.prompt('Nom de la macro');
              if (!name) return;
              const decision = window.prompt('Décision par défaut (approved / rejected / changes_requested)');
              if (!decision) return;
              const template = window.prompt('Message / Raison par défaut');
              apiClient
                .createModerationMacro({ name, decision, template })
                .then(() => {
                  toast.success('Macro créée');
                  queryClient.invalidateQueries({ queryKey: ['moderation-macros'] });
                })
                .catch((error) => {
                  toast.error(error.response?.data?.detail || 'Impossible de créer la macro');
                });
            }}
          >
            <Wand2 className="h-4 w-4 mr-2" /> Nouvelle macro
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {macrosQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des macros...
            </div>
          ) : macrosQuery.data?.length ? (
            macrosQuery.data.map((macro) => (
              <div
                key={macro.id}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border rounded-lg p-3"
              >
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Tag className="h-3 w-3" /> {macro.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{macro.description || 'Sans description'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{DECISION_LABEL[macro.decision] ?? macro.decision}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleApplyMacro(macro)}
                  >
                    Appliquer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      apiClient
                        .deleteModerationMacro(macro.id)
                        .then(() => {
                          toast.success('Macro supprimée');
                          queryClient.invalidateQueries({ queryKey: ['moderation-macros'] });
                        })
                        .catch((error) => {
                          toast.error(error.response?.data?.detail || 'Suppression impossible');
                        });
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucune macro configurée.</p>
          )}
        </CardContent>
      </Card>

      {/* Détails */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Modération du profil</DialogTitle>
          </DialogHeader>

          {selectedQueueItem ? (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Entreprise / Nom</Label>
                  <p className="font-semibold">
                    {selectedQueueItem.entrepreneur?.company_name ||
                      `${selectedQueueItem.entrepreneur?.first_name ?? ''} ${selectedQueueItem.entrepreneur?.last_name ?? ''}`.trim() ||
                      '—'}
                  </p>
                  {selectedQueueItem.entrepreneur?.description && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedQueueItem.entrepreneur.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {renderStatusBadge(selectedQueueItem.status)}
                  {selectedQueueItem.sla_breach && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> SLA dépassé
                    </Badge>
                  )}
                  {selectedQueueItem.priority > 0 && (
                    <Badge variant="outline">Priorité {selectedQueueItem.priority}</Badge>
                  )}
                </div>
              </div>

              <Tabs defaultValue="profil">
                <TabsList>
                  <TabsTrigger value="profil">Profil</TabsTrigger>
                  <TabsTrigger value="justifications">Justification</TabsTrigger>
                  <TabsTrigger value="notes">Notes & Décision</TabsTrigger>
                </TabsList>

                <TabsContent value="profil" className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label>Soumis le</Label>
                      <p>{formatDate(selectedQueueItem.submitted_at)}</p>
                    </div>
                    <div>
                      <Label>Deadline SLA</Label>
                      <p>{formatDate(selectedQueueItem.sla_deadline)}</p>
                    </div>
                    <div>
                      <Label>Email</Label>
                      <p>{selectedQueueItem.entrepreneur?.auth?.email ?? '—'}</p>
                    </div>
                    <div>
                      <Label>Ville</Label>
                      <p>{selectedQueueItem.entrepreneur?.city ?? '—'}</p>
                    </div>
                    <div>
                      <Label>AI Score</Label>
                      <p>{selectedQueueItem.ai_score ?? '—'}</p>
                    </div>
                    <div>
                      <Label>Flags IA</Label>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                        {JSON.stringify(selectedQueueItem.ai_flags ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="justifications" className="space-y-4">
                  <Label>Raison actuelle</Label>
                  <Textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    rows={6}
                    placeholder="Raison / message à transmettre"
                  />
                  <Label>Notes internes</Label>
                  <Textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    rows={4}
                    placeholder="Notes visibles par les autres modérateurs"
                  />
                </TabsContent>

                <TabsContent value="notes" className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Sélectionnez une macro ou rédigez vos propres commentaires, puis validez la décision.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['approved', 'changes_requested', 'rejected'] as const).map((decision) => (
                      <Button
                        key={decision}
                        variant="outline"
                        onClick={() => handleDecision(decision)}
                        disabled={decisionMutation.isPending}
                      >
                        {decisionMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          DECISION_LABEL[decision]
                        )}
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap items-center gap-2 justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAssignToMe}
                  disabled={assignMutation.isPending}
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  M'assigner le dossier
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
