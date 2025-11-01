'use client';

import React, { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Shield, Filter, RefreshCw } from 'lucide-react';
import { formatDate, downloadBlob } from '@/lib/utils';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';
import { AuditLog } from '@/types';

type AuditLogsResponse = {
  data: AuditLog[];
  next_cursor?: string | null;
  summary?: {
    by_severity?: Record<string, number>;
    last_critical_at?: string | null;
  };
};

type AuditEventType = { value: string; label: string };
type AuditStats = {
  critical_events_count: number;
  total_events: number;
  top_event_types: { event_type: string; count: number }[];
  severity_breakdown?: Record<string, number>;
  period_start?: string;
  period_end?: string;
};

const SEVERITY_OPTIONS = [
  { value: 'CRIT', label: 'Critique' },
  { value: 'HIGH', label: 'High' },
  { value: 'MED', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const DEFAULT_FILTERS = {
  severities: [] as string[],
  eventType: 'all',
  search: '',
  actor: '',
  startDate: '',
  endDate: '',
};

export function AuditPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [formState, setFormState] = useState(DEFAULT_FILTERS);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: eventTypes } = useQuery<AuditEventType[]>({
    queryKey: ['audit-event-types'],
    queryFn: () => apiClient.getAuditEventTypes(),
  });

  const queryParams = useMemo(() => {
    const params: Record<string, any> = { limit: 50 };
    if (filters.severities.length) {
      params.severities = filters.severities;
    }
    if (filters.eventType && filters.eventType !== 'all') {
      params.event_types = [filters.eventType];
    }
    if (filters.actor.trim()) {
      params.actor = filters.actor.trim();
    }
    if (filters.search.trim()) {
      params.search = filters.search.trim();
    }
    if (filters.startDate) {
      params.start_date = new Date(`${filters.startDate}T00:00:00Z`).toISOString();
    }
    if (filters.endDate) {
      params.end_date = new Date(`${filters.endDate}T23:59:59Z`).toISOString();
    }
    return params;
  }, [filters]);

  const logsQuery = useInfiniteQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', queryParams],
    queryFn: ({ pageParam }) =>
      apiClient.getAuditLogs({
        ...queryParams,
        cursor: pageParam || undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    initialPageParam: undefined,
  });

  const logs = logsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const logsSummary = logsQuery.data?.pages[0]?.summary;

  const { data: stats } = useQuery<AuditStats>({
    queryKey: ['audit-stats', '7d'],
    queryFn: () => apiClient.getAuditStats('7d'),
  });

  const handleExport = async () => {
    try {
      const blob = await apiClient.exportAuditLogs({
        ...(filters.severities.length ? { severities: filters.severities } : {}),
        ...(filters.eventType !== 'all' ? { event_types: [filters.eventType] } : {}),
        ...(filters.actor.trim() ? { actor: filters.actor.trim() } : {}),
        ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.startDate
          ? { start_date: new Date(`${filters.startDate}T00:00:00Z`).toISOString() }
          : {}),
        ...(filters.endDate
          ? { end_date: new Date(`${filters.endDate}T23:59:59Z`).toISOString() }
          : {}),
      });
      downloadBlob(blob, `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      toast.success('Export réussi (fichier signé)');
    } catch (error) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const toggleSeverity = (value: string) => {
    setFormState((prev) => {
      const already = prev.severities.includes(value);
      if (already) {
        return { ...prev, severities: prev.severities.filter((item) => item !== value) };
      }
      return { ...prev, severities: [...prev.severities, value] };
    });
  };

  const handleReset = () => {
    setFormState(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  const handleApplyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(formState);
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, any> = {
      LOW: 'outline',
      MED: 'secondary',
      HIGH: 'default',
      CRIT: 'destructive',
    };
    return <Badge variant={variants[severity]}>{severity}</Badge>;
  };

  const severitySnapshot = useMemo(() => {
    return logsSummary?.by_severity || {};
  }, [logsSummary]);

  const severityStats = stats?.severity_breakdown || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit & Sécurité</h1>
          <p className="text-muted-foreground">Journal d'audit immuable des actions administratives</p>
        </div>
        <Button onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Exporter (Signé)
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Événements (7j)</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_events || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Événements Critiques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats?.critical_events_count || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Types d'Événements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.top_event_types?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dernier critique</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {logsSummary?.last_critical_at
                ? formatDate(logsSummary.last_critical_at, 'relative')
                : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtres avancés
          </CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Réinitialiser
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleApplyFilters} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Recherche globale</Label>
                <Input
                  placeholder="Rechercher par événement, endpoint, IP..."
                  value={formState.search}
                  onChange={(event) => setFormState((prev) => ({ ...prev, search: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Admin / Utilisateur</Label>
                <Input
                  placeholder="UUID admin ou utilisateur"
                  value={formState.actor}
                  onChange={(event) => setFormState((prev) => ({ ...prev, actor: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sévérités</Label>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_OPTIONS.map((option) => {
                  const selected = formState.severities.includes(option.value);
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      onClick={() => toggleSeverity(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Type d'événement</Label>
                <Select
                  value={formState.eventType}
                  onValueChange={(value) => setFormState((prev) => ({ ...prev, eventType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {eventTypes?.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date début</Label>
                  <Input
                    type="date"
                    value={formState.startDate}
                    onChange={(event) => setFormState((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date fin</Label>
                  <Input
                    type="date"
                    value={formState.endDate}
                    onChange={(event) => setFormState((prev) => ({ ...prev, endDate: event.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit">
                Appliquer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Severity Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sévérité (filtres actuels)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {SEVERITY_OPTIONS.map((option) => (
              <div
                key={option.value}
                className="flex flex-col items-start border rounded-md px-3 py-2 min-w-[120px]"
              >
                <span className="text-xs text-muted-foreground">{option.label}</span>
                <span className="text-lg font-semibold">{severitySnapshot[option.value] ?? 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Journal d'Audit</CardTitle>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityBadge(log.severity)}
                      <Badge variant="outline">{log.event_type}</Badge>
                      <Badge variant={log.hash_valid ? 'secondary' : 'destructive'}>
                        {log.hash_valid ? 'Signature valide' : 'Signature douteuse'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Admin ID: {log.admin_id || 'N/A'} | Utilisateur: {log.user_id || 'N/A'} | IP: {log.ip_address || 'N/A'}
                    </p>
                    {log.metadata && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {JSON.stringify(log.metadata).slice(0, 100)}...
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-right text-sm text-muted-foreground">
                      {formatDate(log.created_at, 'long')}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setSelectedLog(log)}>
                      Détails
                    </Button>
                  </div>
                </div>
              ))}
              {logsQuery.hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => logsQuery.fetchNextPage()}
                    disabled={logsQuery.isFetchingNextPage}
                  >
                    {logsQuery.isFetchingNextPage ? 'Chargement...' : 'Charger plus'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Aucun log disponible</p>
          )}
        </CardContent>
      </Card>

      {/* Top Events */}
      {stats?.top_event_types && stats.top_event_types.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Événements (7j)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.top_event_types.map((event, idx) => (
                <div key={`${event.event_type}-${idx}`} className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">{event.event_type}</span>
                  <Badge>{event.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global severity breakdown */}
      {Object.keys(severityStats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sévérités (période 7 jours)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              {SEVERITY_OPTIONS.map((option) => (
                <div key={option.value} className="border rounded-md p-3">
                  <p className="text-xs text-muted-foreground">{option.label}</p>
                  <p className="text-xl font-semibold">{severityStats[option.value] ?? 0}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          {selectedLog && (
            <>
              <DialogHeader>
                <DialogTitle>Événement {selectedLog.event_type}</DialogTitle>
                <DialogDescription>
                  Enregistré le {formatDate(selectedLog.created_at, 'long')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Sévérité</p>
                    <p className="font-medium">{selectedLog.severity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">HTTP</p>
                    <p className="font-medium">
                      {selectedLog.http_method || 'N/A'} · {selectedLog.status_code || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Admin</p>
                    <p className="font-medium break-all">{selectedLog.admin_id || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Utilisateur</p>
                    <p className="font-medium break-all">{selectedLog.user_id || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">IP</p>
                    <p className="font-medium">{selectedLog.ip_address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Endpoint</p>
                    <p className="font-medium break-all">{selectedLog.endpoint || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground uppercase">Signature</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                      {selectedLog.log_hash || '—'}
                    </code>
                    <Badge variant={selectedLog.hash_valid ? 'secondary' : 'destructive'}>
                      {selectedLog.hash_valid ? 'Signature valide' : 'Signature invalide'}
                    </Badge>
                    {!selectedLog.hash_valid && selectedLog.computed_hash && (
                      <Badge variant="outline">Attendu: {selectedLog.computed_hash.slice(0, 12)}…</Badge>
                    )}
                  </div>
                </div>

                {selectedLog.user_agent && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">User Agent</p>
                    <p className="text-sm break-all">{selectedLog.user_agent}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground uppercase flex items-center gap-2">
                    Métadonnées
                    <Badge variant="outline">{selectedLog.metadata ? 'JSON' : 'vide'}</Badge>
                  </p>
                  <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted/50 p-3 text-xs">
                    {JSON.stringify(selectedLog.metadata ?? {}, null, 2)}
                  </pre>
                </div>

                {selectedLog.changes && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Changements</p>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted/50 p-3 text-xs">
                      {JSON.stringify(selectedLog.changes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
