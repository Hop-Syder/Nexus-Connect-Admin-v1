'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Settings as SettingsIcon,
  Database,
  Mail,
  Shield,
  Bell,
  Wrench,
  Loader2,
  Power,
  RefreshCw,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';
import { SystemSetting } from '@/types';

const MAINTENANCE_ENABLED_KEY = 'system.maintenance.enabled';
const MAINTENANCE_MESSAGE_KEY = 'system.maintenance.message';

type SettingsCategory = {
  id: string;
  label: string;
  settings: SystemSetting[];
};

type SettingsResponse = {
  categories: SettingsCategory[];
  total: number;
  last_updated_at?: string;
};

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  healthy: 'secondary',
  configured: 'secondary',
  degraded: 'default',
  unconfigured: 'outline',
  unknown: 'outline',
  unhealthy: 'destructive',
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const { data: settingsResponse, isLoading: settingsLoading, refetch: refetchSettings } = useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const categories = settingsResponse?.categories ?? [];

  const settingsMap = useMemo(() => {
    const map: Record<string, SystemSetting> = {};
    categories.forEach((category) => {
      category.settings.forEach((setting) => {
        map[setting.setting_key] = setting;
      });
    });
    return map;
  }, [categories]);

  useEffect(() => {
    const messageSetting = settingsMap[MAINTENANCE_MESSAGE_KEY];
    setMaintenanceMessage(String(messageSetting?.parsed_value ?? messageSetting?.setting_value ?? ''));
  }, [settingsMap]);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.checkHealth(),
    refetchInterval: 60000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiClient.getNotifications(false),
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => apiClient.updateSetting(key, value),
    onSuccess: (_, variables) => {
      toast.success('Paramètre mis à jour');
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Mise à jour impossible');
    },
  });

  const toggleMaintenanceMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; message?: string | null }) => apiClient.toggleMaintenance(payload),
    onSuccess: (_, variables) => {
      toast.success(variables.enabled ? 'Maintenance activée' : 'Maintenance désactivée');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Impossible de modifier la maintenance');
    },
  });

  const backupMutation = useMutation({
    mutationFn: (payload: { reason?: string; include_storage?: boolean }) => apiClient.triggerBackup(payload),
    onSuccess: () => {
      toast.success('Sauvegarde déclenchée');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Impossible de déclencher le backup');
    },
  });

  const markNotificationMutation = useMutation({
    mutationFn: (notificationId: string) => apiClient.markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const maintenanceEnabled = Boolean(settingsMap[MAINTENANCE_ENABLED_KEY]?.parsed_value);

  const renderStatusBadge = (statusValue: string) => {
    const variant = statusVariant[statusValue] || 'outline';
    return <Badge variant={variant}>{statusValue || 'unknown'}</Badge>;
  };

  const startEditing = (setting: SystemSetting) => {
    const raw = setting.setting_type === 'json'
      ? JSON.stringify(setting.parsed_value ?? setting.setting_value ?? {}, null, 2)
      : String(setting.parsed_value ?? setting.setting_value ?? '');
    setEditingValues((prev) => ({ ...prev, [setting.setting_key]: raw }));
  };

  const cancelEditing = (key: string) => {
    setEditingValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSaveSetting = (setting: SystemSetting) => {
    const rawValue = editingValues[setting.setting_key];
    if (rawValue === undefined) {
      return;
    }

    let value: any = rawValue;
    if (setting.setting_type === 'number') {
      const numeric = Number(rawValue);
      if (Number.isNaN(numeric)) {
        toast.error('Valeur numérique invalide');
        return;
      }
      value = numeric;
    } else if (setting.setting_type === 'json') {
      try {
        value = rawValue ? JSON.parse(rawValue) : {};
      } catch (error) {
        toast.error('JSON invalide');
        return;
      }
    }

    updateSettingMutation.mutate({ key: setting.setting_key, value });
  };

  const toggleBooleanSetting = (setting: SystemSetting) => {
    const currentValue = Boolean(setting.parsed_value);
    updateSettingMutation.mutate({ key: setting.setting_key, value: !currentValue });
  };

  const handleMaintenanceToggle = () => {
    toggleMaintenanceMutation.mutate({
      enabled: !maintenanceEnabled,
      message: maintenanceMessage || null,
    });
  };

  const handleTriggerBackup = (includeStorage: boolean) => {
    backupMutation.mutate({ reason: 'manual', include_storage: includeStorage });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Configuration système et paramètres</p>
      </div>

      {/* Health Check */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            État du Système
          </CardTitle>
          <CardDescription>Vérification des services critiques</CardDescription>
        </CardHeader>
        <CardContent>
          {health ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded">
                <span className="font-medium">Statut Global</span>
                {renderStatusBadge(health.status)}
              </div>
              {health.checks && (
                <>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">Base de Données</span>
                    {renderStatusBadge(health.checks.database)}
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">Redis</span>
                    {renderStatusBadge(health.checks.redis)}
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">Service E-mail</span>
                    {renderStatusBadge(health.checks.email_service)}
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span className="font-medium">Service Paiement</span>
                    {renderStatusBadge(health.checks.payment_service)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">Chargement...</p>
          )}
        </CardContent>
      </Card>

      {/* Settings Categories */}
      <div className="grid gap-4 md:grid-cols-2">
        {settingsLoading && (
          <Card>
            <CardContent className="p-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Chargement des paramètres…
            </CardContent>
          </Card>
        )}

        {!settingsLoading && categories.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Aucun paramètre à afficher.
            </CardContent>
          </Card>
        )}

        {categories.map((category) => (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {category.id === 'general' && <SettingsIcon className="h-5 w-5" />}
                {category.id === 'email' && <Mail className="h-5 w-5" />}
                {category.id === 'security' && <Shield className="h-5 w-5" />}
                {category.id === 'storage' && <Database className="h-5 w-5" />}
                {category.id === 'notifications' && <Bell className="h-5 w-5" />}
                {category.id === 'maintenance' && <Wrench className="h-5 w-5" />}
                {category.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {category.settings.map((setting) => {
                  const isBoolean = setting.setting_type === 'boolean';
                  const isEditing = Object.prototype.hasOwnProperty.call(editingValues, setting.setting_key);

                  return (
                    <div key={setting.id} className="p-3 border rounded">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">{setting.setting_key}</p>
                          {setting.description && (
                            <p className="text-xs text-muted-foreground mt-1">{setting.description}</p>
                          )}
                        </div>
                        <div className="min-w-[160px] flex flex-col items-end gap-2">
                          {isBoolean ? (
                            <Button
                              size="sm"
                              variant={Boolean(setting.parsed_value) ? 'default' : 'outline'}
                              onClick={() => toggleBooleanSetting(setting)}
                              disabled={updateSettingMutation.isPending}
                            >
                              {Boolean(setting.parsed_value) ? 'Activé' : 'Désactivé'}
                            </Button>
                          ) : isEditing ? (
                            <div className="flex flex-col gap-2 w-full">
                              {setting.setting_type === 'json' ? (
                                <Textarea
                                  rows={4}
                                  value={editingValues[setting.setting_key]}
                                  onChange={(event) =>
                                    setEditingValues((prev) => ({
                                      ...prev,
                                      [setting.setting_key]: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <Input
                                  value={editingValues[setting.setting_key]}
                                  onChange={(event) =>
                                    setEditingValues((prev) => ({
                                      ...prev,
                                      [setting.setting_key]: event.target.value,
                                    }))
                                  }
                                />
                              )}
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveSetting(setting)}
                                  disabled={updateSettingMutation.isPending}
                                >
                                  Enregistrer
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => cancelEditing(setting.setting_key)}>
                                  Annuler
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm text-muted-foreground max-w-[200px] break-words text-right">
                                {setting.parsed_value !== undefined
                                  ? String(setting.parsed_value)
                                  : setting.setting_value}
                              </span>
                              <Button size="sm" variant="outline" onClick={() => startEditing(setting)}>
                                Modifier
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {category.settings.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun paramètre</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications Récentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {notifications && notifications.length > 0 ? (
              notifications.slice(0, 5).map((notif: any) => (
                <div key={notif.id} className="flex items-start justify-between p-3 border rounded">
                  <div className="flex-1">
                    <p className="font-medium">{notif.title}</p>
                    <p className="text-sm text-muted-foreground">{notif.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={notif.type === 'error' ? 'destructive' : 'secondary'}>
                      {notif.type || 'info'}
                    </Badge>
                    {!notif.is_read && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markNotificationMutation.mutate(notif.id)}
                      >
                        Marquer lu
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">Aucune notification</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions Système</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-center">
              <Button onClick={() => handleTriggerBackup(false)} disabled={backupMutation.isPending}>
                <Database className="h-4 w-4 mr-2" />
                {backupMutation.isPending ? 'Déclenchement…' : 'Déclencher Backup'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTriggerBackup(true)}
                disabled={backupMutation.isPending}
              >
                <Database className="h-4 w-4 mr-2" />
                Backup + Stockage
              </Button>
              <Button variant="outline" onClick={() => refetchSettings()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recharger Paramètres
              </Button>
            </div>

            <div className="border rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    Mode maintenance
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Affiche un message de maintenance sur l&apos;application publique.
                  </p>
                </div>
                <Button
                  variant={maintenanceEnabled ? 'destructive' : 'outline'}
                  onClick={handleMaintenanceToggle}
                  disabled={toggleMaintenanceMutation.isPending}
                >
                  {maintenanceEnabled ? 'Désactiver' : 'Activer'}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Message de maintenance</Label>
                <Textarea
                  rows={3}
                  value={maintenanceMessage}
                  onChange={(event) => setMaintenanceMessage(event.target.value)}
                  placeholder="Nous revenons bientôt..."
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toggleMaintenanceMutation.mutate({
                        enabled: maintenanceEnabled,
                        message: maintenanceMessage || null,
                      })
                    }
                    disabled={toggleMaintenanceMutation.isPending}
                  >
                    Mettre à jour message
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
