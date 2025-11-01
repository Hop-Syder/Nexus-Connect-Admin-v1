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
  Archive,
  Loader2,
  Mail,
  Search,
  Send,
  Tag,
  UserPlus,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { ContactMessage } from '@/types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type MessagesResponse = ContactMessage[];

type SupportTemplate = {
  id: string;
  name: string;
  subject: string;
  content: string;
  category?: string;
  created_at: string;
  updated_at: string;
};

const STATUS_TABS = [
  { value: 'new', label: 'Nouveaux' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'replied', label: 'Répondus' },
  { value: 'archived', label: 'Archivés' },
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'Élevée' },
  { value: 'normal', label: 'Normale' },
  { value: 'low', label: 'Basse' },
];

export function MessagesPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('new');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<SupportTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    subject: '',
    content: '',
    category: '',
  });

  const messagesQuery = useQuery<MessagesResponse>({
    queryKey: ['messages', statusFilter, priorityFilter, searchTerm],
    queryFn: () =>
      apiClient.getMessages({
        status_filter: statusFilter,
        priority: priorityFilter === 'all' ? undefined : priorityFilter,
        search: searchTerm || undefined,
      }),
  });

  const statsQuery = useQuery({
    queryKey: ['messages-stats'],
    queryFn: () => apiClient.getMessagesStats(),
    refetchInterval: 30000,
  });

  const templatesQuery = useQuery<SupportTemplate[]>({
    queryKey: ['support-templates'],
    queryFn: () => apiClient.getSupportTemplates(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiClient.updateMessage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Mise à jour impossible');
    },
  });

  const replyMutation = useMutation({
    mutationFn: (
      payload: { id: string; content: string; template_id?: string; subject?: string },
    ) => apiClient.replyToMessage(payload.id, {
      response_content: payload.content,
      template_id: payload.template_id,
      subject: payload.subject,
    }),
    onSuccess: () => {
      toast.success('Réponse envoyée');
      setSelectedMessage(null);
      setReplyContent('');
      setReplySubject('');
      setSelectedTemplate(null);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Impossible d'envoyer la réponse");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.archiveMessage(id),
    onSuccess: () => {
      toast.success('Message archivé');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['messages-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || "Impossible d'archiver");
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiClient.createSupportTemplate(data),
    onSuccess: () => {
      toast.success('Modèle enregistré');
      setNewTemplate({ name: '', subject: '', content: '', category: '' });
      setTemplateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['support-templates'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Impossible de créer le modèle');
    },
  });

  const filteredMessages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  const handleSelectMessage = (message: ContactMessage) => {
    setSelectedMessage(message);
    setReplyContent(message.metadata?.response_content || '');
    setReplySubject(message.subject ? `Re: ${message.subject}` : 'Réponse à votre demande');
    setSelectedTemplate(null);
  };

  const applyTemplate = (template: SupportTemplate) => {
    setSelectedTemplate(template);
    setReplySubject(template.subject);
    setReplyContent(template.content);
  };

  const submitReply = () => {
    if (!selectedMessage) {
      toast.error('Aucun message sélectionné');
      return;
    }
    if (!replyContent.trim()) {
      toast.error('Le contenu de la réponse est vide');
      return;
    }

    replyMutation.mutate({
      id: selectedMessage.id,
      content: replyContent,
      template_id: selectedTemplate?.id,
      subject: replySubject,
    });
  };

  const updateAssignment = (messageId: string, field: string, value: any) => {
    updateMutation.mutate({ id: messageId, data: { [field]: value } });
  };

  const priorityBadge = (priority?: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      urgent: { variant: 'destructive', label: 'Urgent' },
      high: { variant: 'default', label: 'Élevée' },
      normal: { variant: 'secondary', label: 'Normale' },
      low: { variant: 'outline', label: 'Basse' },
    };
    const config = map[priority || 'normal'];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Support & Messages</h1>
          <p className="text-muted-foreground">
            Priorisez les demandes entrantes, assignez les agents et répondez rapidement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher (nom, email, sujet...)"
            className="w-72"
          />
          <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
            <Tag className="h-4 w-4 mr-2" /> Nouveau modèle
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Nouveaux messages</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsQuery.data?.new_messages ?? '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Alertes SLA</CardTitle>
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
                <CardTitle className="text-sm font-medium">Non assignés</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statsQuery.data?.unassigned ?? '—'}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Messages ({filteredMessages.length})</CardTitle>
                <CardDescription>
                  Utilisez les filtres pour ajuster la priorité ou le statut SLA.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Priorité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes priorités</SelectItem>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {messagesQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : filteredMessages.length ? (
                <div className="space-y-2">
                  {filteredMessages.map((message) => (
                    <div
                      key={message.id}
                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-lg p-4 hover:bg-accent transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{message.name}</p>
                          {priorityBadge(message.metadata?.priority)}
                          {message.metadata?.sla_breach && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> SLA
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {message.subject}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {message.message}
                        </p>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDate(message.created_at)} • {message.email}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                          {message.metadata?.tags?.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 md:w-56">
                        <Select
                          value={message.metadata?.assigned_to ?? ''}
                          onValueChange={(value) =>
                            updateAssignment(message.id, 'assigned_to', value || null)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Assigner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Non assigné</SelectItem>
                            <SelectItem value="triage">Triage</SelectItem>
                            <SelectItem value="support">Support</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => handleSelectMessage(message)}>
                          Traiter
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => archiveMutation.mutate(message.id)}
                        >
                          <Archive className="h-4 w-4 mr-2" /> Archiver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-10">
                  Aucun message pour ce filtre.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reply / detail drawer */}
      {selectedMessage && (
        <Dialog open={Boolean(selectedMessage)} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Répondre à {selectedMessage.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Message reçu</CardTitle>
                  <CardDescription>
                    {formatDate(selectedMessage.created_at)} — {selectedMessage.email}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{selectedMessage.subject}</p>
                  <p>{selectedMessage.message}</p>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Priorité</Label>
                  <Select
                    value={selectedMessage.metadata?.priority || 'normal'}
                    onValueChange={(value) =>
                      updateAssignment(selectedMessage.id, 'priority', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <Input
                    value={selectedMessage.metadata?.category ?? ''}
                    onChange={(e) =>
                      updateAssignment(selectedMessage.id, 'category', e.target.value || null)
                    }
                    placeholder="Support, partenariat..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Modèles disponibles</Label>
                <div className="flex flex-wrap gap-2">
                  {templatesQuery.data?.map((template) => (
                    <Button
                      key={template.id}
                      variant={selectedTemplate?.id === template.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => applyTemplate(template)}
                    >
                      {template.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sujet de la réponse</Label>
                <Input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Contenu de la réponse</Label>
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  rows={8}
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedMessage(null)}>
                  Annuler
                </Button>
                <Button onClick={submitReply} disabled={replyMutation.isPending}>
                  {replyMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" /> Envoyer
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Template dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau modèle de réponse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input
                value={newTemplate.name}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, name: e.target.value }))}
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
              <Label>Catégorie</Label>
              <Input
                value={newTemplate.category}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Support, Facturation..."
              />
            </div>
            <div className="space-y-1">
              <Label>Contenu</Label>
              <Textarea
                value={newTemplate.content}
                onChange={(e) => setNewTemplate((prev) => ({ ...prev, content: e.target.value }))}
                rows={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={() => createTemplateMutation.mutate(newTemplate)}>
                {createTemplateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Sauvegarder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
