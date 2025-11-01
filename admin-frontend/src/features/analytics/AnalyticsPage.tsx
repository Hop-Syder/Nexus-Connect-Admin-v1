'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  TrendingUp,
  Globe,
  DollarSign,
  ActivitySquare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';
import {
  AnalyticsOverview,
  DashboardKPIs,
  CampaignOverviewStats,
} from '@/types';
import { formatCurrency, formatNumber } from '@/lib/utils';

export function AnalyticsPage() {
  const [growthPeriod, setGrowthPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [revenuePeriod, setRevenuePeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { data: kpis } = useQuery<DashboardKPIs>({
    queryKey: ['analytics-kpis'],
    queryFn: () => apiClient.getDashboardKPIs(),
  });

  const { data: overview } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-overview'],
    queryFn: () => apiClient.getAnalyticsOverview(),
  });

  const { data: campaignsOverview } = useQuery<CampaignOverviewStats>({
    queryKey: ['campaign-overview'],
    queryFn: () => apiClient.getCampaignOverview(),
  });

  const { data: growth } = useQuery({
    queryKey: ['user-growth', growthPeriod],
    queryFn: () => apiClient.getUserGrowth(growthPeriod),
  });

  const { data: geo } = useQuery({
    queryKey: ['geo-distribution'],
    queryFn: () => apiClient.getUserGeoDistribution(),
  });

  const { data: revenue } = useQuery({
    queryKey: ['revenue-stats', revenuePeriod],
    queryFn: () => apiClient.getRevenueStats(revenuePeriod),
  });

  const { data: contentStats } = useQuery({
    queryKey: ['content-stats'],
    queryFn: () => apiClient.getContentStats(),
  });

  const statusColors = useMemo(() => ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#6366f1', '#0ea5e9'], []);
  const queueColors = useMemo(() => ['#2563eb', '#f97316', '#dc2626', '#94a3b8'], []);

  const growthChartData = useMemo(() => growth ?? [], [growth]);
  const geoChartData = useMemo(() => geo ?? [], [geo]);

  const contentStatusData = useMemo(() => {
    if (!contentStats) {
      return [];
    }
    return Object.entries(contentStats)
      .filter(([key]) => !key.startsWith('queue_') && key !== 'total')
      .map(([key, value]) => ({
        status: key,
        label: key.replace(/_/g, ' '),
        value: Number(value) || 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [contentStats]);

  const queueStatusData = useMemo(() => {
    if (!contentStats) {
      return [];
    }
    return Object.entries(contentStats)
      .filter(([key]) => key.startsWith('queue_') && key !== 'queue_sla_breach')
      .map(([key, value]) => ({
        status: key.replace('queue_', ''),
        label: key.replace('queue_', '').replace(/_/g, ' '),
        value: Number(value) || 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [contentStats]);

  const contentTotal = Number(contentStats?.total || 0);
  const queueSlaBreach = Number(contentStats?.queue_sla_breach || 0);

  const exportMutation = useMutation({
    mutationFn: (type: string) => apiClient.exportAnalytics(type),
    onSuccess: (blob, type) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Export généré');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Export impossible");
    },
  });

  const handleExport = (type: string) => exportMutation.mutate(type);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Consolidez les KPIs clés, les revenus et la portée géographique de la plateforme.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => handleExport('users')}>
            <Download className="h-4 w-4 mr-2" /> Utilisateurs
          </Button>
          <Button variant="outline" onClick={() => handleExport('subscriptions')}>
            <Download className="h-4 w-4 mr-2" /> Abonnements
          </Button>
          <Button variant="outline" onClick={() => handleExport('entrepreneurs')}>
            <Download className="h-4 w-4 mr-2" /> Entrepreneurs
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs totaux</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(kpis?.total_users || 0)}</div>
            <p className="text-xs text-muted-foreground">
              +{formatNumber(kpis?.active_users_7d || 0)} actifs (7j)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(kpis?.premium_users || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.mrr_xof || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profils publiés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(kpis?.published_profiles || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(overview?.premium_users || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campagnes envoyées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(campaignsOverview?.sent_campaigns || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campagnes planifiées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(campaignsOverview?.scheduled_campaigns || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails envoyés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(campaignsOverview?.emails_sent || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Croissance utilisateurs
            </CardTitle>
            <Select value={growthPeriod} onValueChange={(value) => setGrowthPeriod(value as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 jours</SelectItem>
                <SelectItem value="30d">30 jours</SelectItem>
                <SelectItem value="90d">90 jours</SelectItem>
                <SelectItem value="1y">1 an</SelectItem>
              </SelectContent>
            </Select>
        </CardHeader>
        <CardContent>
          {growth && growth.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-10">Pas de données suffisantes.</p>
          )}
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> Répartition géographique
            </CardTitle>
          </CardHeader>
          <CardContent>
            {geo && geo.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={geoChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="country" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-10">Aucune donnée disponible.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Revenus
          </CardTitle>
          <Select value={revenuePeriod} onValueChange={(value) => setRevenuePeriod(value as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 jours</SelectItem>
              <SelectItem value="30d">30 jours</SelectItem>
              <SelectItem value="90d">90 jours</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">MRR actuel</p>
              <p className="text-2xl font-bold">{formatCurrency(revenue?.mrr || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Revenus période</p>
              <p className="text-2xl font-bold">{formatCurrency(revenue?.total_revenue_period || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Transactions</p>
              <p className="text-2xl font-bold">{formatNumber(revenue?.transactions_count || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ActivitySquare className="h-5 w-5" /> Détail contenu
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contentStats ? (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm font-medium">Profils par statut</p>
                {contentStatusData.length ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={contentStatusData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={50}
                          outerRadius={110}
                          paddingAngle={4}
                        >
                          {contentStatusData.map((entry, index) => (
                            <Cell key={entry.status} fill={statusColors[index % statusColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatNumber(value)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune donnée de statut disponible.</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="border rounded p-3">
                    <p className="text-muted-foreground">Total fiches</p>
                    <p className="text-lg font-semibold">{formatNumber(contentTotal)}</p>
                  </div>
                  <div className="border rounded p-3">
                    <p className="text-muted-foreground">Rejets</p>
                    <p className="text-lg font-semibold">
                      {formatNumber(contentStatusData.find((item) => item.status === 'rejected')?.value || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">File de modération</p>
                  <Badge variant={queueSlaBreach > 0 ? 'destructive' : 'secondary'}>
                    SLA en retard: {formatNumber(queueSlaBreach)}
                  </Badge>
                </div>
                {queueStatusData.length ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={queueStatusData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" />
                        <YAxis allowDecimals={false} />
                        <Tooltip formatter={(value: number) => formatNumber(value)} />
                        <Bar dataKey="value">
                          {queueStatusData.map((entry, index) => (
                            <Cell key={entry.status} fill={queueColors[index % queueColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune donnée de file de modération.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Aucune donnée de contenu disponible.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
