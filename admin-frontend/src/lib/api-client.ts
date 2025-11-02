'use client';

import axios, { AxiosInstance, AxiosError } from 'axios';
import { toast } from 'sonner';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://nexus-connect-admin-production.up.railway.app';

class AdminApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor - Add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('admin_access_token')
            : null;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<any>) => {
        if (error.response?.status === 401) {
          // Token expired, try refresh
          const refreshToken =
            typeof window !== 'undefined'
              ? window.localStorage.getItem('admin_refresh_token')
              : null;
          if (refreshToken) {
            try {
              const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                refresh_token: refreshToken,
              });
              
              const { access_token, refresh_token } = response.data;
              if (typeof window !== 'undefined') {
                window.localStorage.setItem('admin_access_token', access_token);
                window.localStorage.setItem('admin_refresh_token', refresh_token);
              }
              
              // Retry original request
              if (error.config) {
                error.config.headers.Authorization = `Bearer ${access_token}`;
                return this.client.request(error.config);
              }
            } catch (refreshError) {
              // Refresh failed, logout
              this.logout();
              if (typeof window !== 'undefined') {
                window.location.href = '/login';
              }
            }
          } else {
            this.logout();
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }
        }

        // Show error toast
        const message = error.response?.data?.detail || error.message || 'Une erreur est survenue';
        toast.error(message);

        return Promise.reject(error);
      }
    );
  }

  private logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('admin_access_token');
      window.localStorage.removeItem('admin_refresh_token');
      window.localStorage.removeItem('admin_user');
    }
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async verify2FA(userId: string, code: string) {
    const response = await this.client.post('/auth/verify-2fa', { user_id: userId, code });
    return response.data;
  }

  async setup2FA() {
    const response = await this.client.post('/auth/setup-2fa');
    return response.data;
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async logoutUser() {
    const response = await this.client.post('/auth/logout');
    this.logout();
    return response.data;
  }

  // Users endpoints
  async getUsers(params?: any) {
    const response = await this.client.get('/users', { params });
    return response.data;
  }

  async getUser(userId: string) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  async startImpersonation(userId: string) {
    const response = await this.client.post(`/users/${userId}/impersonate`);
    return response.data;
  }

  async revokeImpersonation(userId: string, sessionId?: string) {
    const response = await this.client.post(`/users/${userId}/impersonate/revoke`, {
      session_id: sessionId,
    });
    return response.data;
  }

  async updateUser(userId: string, data: any) {
    const response = await this.client.put(`/users/${userId}`, data);
    return response.data;
  }

  async deleteUser(userId: string, hardDelete = false) {
    const response = await this.client.delete(`/users/${userId}`, {
      params: { hard_delete: hardDelete },
    });
    return response.data;
  }

  async bulkUserAction(userIds: string[], action: string, params?: any) {
    const response = await this.client.post('/users/bulk-action', {
      user_ids: userIds,
      action,
      params,
    });
    return response.data;
  }

  async exportUsersCSV(params?: any) {
    const response = await this.client.get('/users/export/csv', {
      params,
      responseType: 'blob',
    });
    return response.data;
  }

  async getUserSegments() {
    const response = await this.client.get('/users/segments');
    return response.data;
  }

  async createUserSegment(data: any) {
    const response = await this.client.post('/users/segments', data);
    return response.data;
  }

  async updateUserSegment(segmentId: string, data: any) {
    const response = await this.client.put(`/users/segments/${segmentId}`, data);
    return response.data;
  }

  async deleteUserSegment(segmentId: string) {
    const response = await this.client.delete(`/users/segments/${segmentId}`);
    return response.data;
  }

  // Subscriptions endpoints
  async getPlans(params?: any) {
    const response = await this.client.get('/subscriptions/plans', { params });
    return response.data;
  }

  async createPlan(data: any) {
    const response = await this.client.post('/subscriptions/plans', data);
    return response.data;
  }

  async updatePlan(planId: string, data: any) {
    const response = await this.client.put(`/subscriptions/plans/${planId}`, data);
    return response.data;
  }

  async deletePlan(planId: string) {
    const response = await this.client.delete(`/subscriptions/plans/${planId}`);
    return response.data;
  }

  async grantPremium(data: any) {
    const response = await this.client.post('/subscriptions/grant-premium', data);
    return response.data;
  }

  async revokePremium(data: any) {
    const response = await this.client.post('/subscriptions/revoke-premium', data);
    return response.data;
  }

  async getSubscriptionHistory(userId: string) {
    const response = await this.client.get(`/subscriptions/history/${userId}`);
    return response.data;
  }

  async getSubscriptionStats() {
    const response = await this.client.get('/subscriptions/stats');
    return response.data;
  }

  async getExpiringSubscriptions(params?: any) {
    const response = await this.client.get('/subscriptions/expiring-soon', {
      params,
    });
    return response.data;
  }

  async createCoupon(data: any) {
    const response = await this.client.post('/subscriptions/coupons', data);
    return response.data;
  }

  async updateCoupon(couponId: string, data: any) {
    const response = await this.client.put(`/subscriptions/coupons/${couponId}`, data);
    return response.data;
  }

  async getCoupons(params?: any) {
    const response = await this.client.get('/subscriptions/coupons', { params });
    return response.data;
  }

  // Campaigns endpoints
  async getCampaigns(params?: any) {
    const response = await this.client.get('/campaigns', { params });
    return response.data;
  }

  async createCampaign(data: any) {
    const response = await this.client.post('/campaigns', data);
    return response.data;
  }

  async updateCampaign(campaignId: string, data: any) {
    const response = await this.client.put(`/campaigns/${campaignId}`, data);
    return response.data;
  }

  async scheduleCampaign(campaignId: string, data: any) {
    const response = await this.client.post(`/campaigns/${campaignId}/schedule`, data);
    return response.data;
  }

  async cancelCampaign(campaignId: string) {
    const response = await this.client.post(`/campaigns/${campaignId}/cancel`);
    return response.data;
  }

  async sendCampaign(campaignId: string, data: any) {
    const response = await this.client.post(`/campaigns/${campaignId}/send`, data);
    return response.data;
  }

  async getCampaign(campaignId: string) {
    const response = await this.client.get(`/campaigns/${campaignId}`);
    return response.data;
  }

  async getCampaignStats(campaignId: string) {
    const response = await this.client.get(`/campaigns/${campaignId}/stats`);
    return response.data;
  }

  async getCampaignOverview() {
    const response = await this.client.get('/campaigns/stats/overview');
    return response.data;
  }

  async getCampaignTemplates(params?: any) {
    const response = await this.client.get('/campaigns/templates', { params });
    return response.data;
  }

  async createCampaignTemplate(data: any) {
    const response = await this.client.post('/campaigns/templates', data);
    return response.data;
  }

  async updateCampaignTemplate(templateId: string, data: any) {
    const response = await this.client.put(`/campaigns/templates/${templateId}`, data);
    return response.data;
  }

  async deleteCampaignTemplate(templateId: string) {
    const response = await this.client.delete(`/campaigns/templates/${templateId}`);
    return response.data;
  }

  async getSupportTemplates() {
    const response = await this.client.get('/messages/templates');
    return response.data;
  }

  async createSupportTemplate(data: any) {
    const response = await this.client.post('/messages/templates', data);
    return response.data;
  }

  async updateSupportTemplate(templateId: string, data: any) {
    const response = await this.client.put(`/messages/templates/${templateId}`, data);
    return response.data;
  }

  async deleteSupportTemplate(templateId: string) {
    const response = await this.client.delete(`/messages/templates/${templateId}`);
    return response.data;
  }

  // Moderation endpoints
  async getModerationQueue(params?: any) {
    const response = await this.client.get('/entrepreneurs/moderation-queue', { params });
    return response.data;
  }

  async getEntrepreneurForModeration(entrepreneurId: string) {
    const response = await this.client.get(`/entrepreneurs/entrepreneurs/${entrepreneurId}`);
    return response.data;
  }

  async moderateEntrepreneur(entrepreneurId: string, data: any) {
    const response = await this.client.post(`/entrepreneurs/entrepreneurs/${entrepreneurId}/moderate`, data);
    return response.data;
  }

  async getModerationStats() {
    const response = await this.client.get('/entrepreneurs/moderation/stats');
    return response.data;
  }

  async getModerationMacros() {
    const response = await this.client.get('/entrepreneurs/moderation/macros');
    return response.data;
  }

  async createModerationMacro(data: any) {
    const response = await this.client.post('/entrepreneurs/moderation/macros', data);
    return response.data;
  }

  async updateModerationMacro(macroId: string, data: any) {
    const response = await this.client.put(`/entrepreneurs/moderation/macros/${macroId}`, data);
    return response.data;
  }

  async deleteModerationMacro(macroId: string) {
    const response = await this.client.delete(`/entrepreneurs/moderation/macros/${macroId}`);
    return response.data;
  }

  async assignModerationItem(data: any) {
    const response = await this.client.post('/entrepreneurs/moderation/assign', data);
    return response.data;
  }

  async updateModerationStatus(queueId: string, data: any) {
    const response = await this.client.post(`/entrepreneurs/moderation/${queueId}/status`, data);
    return response.data;
  }

  // Messages endpoints
  async getMessages(params?: any) {
    const response = await this.client.get('/messages', { params });
    return response.data;
  }

  async getMessage(messageId: string) {
    const response = await this.client.get(`/messages/${messageId}`);
    return response.data;
  }

  async updateMessage(messageId: string, data: any) {
    const response = await this.client.put(`/messages/${messageId}`, data);
    return response.data;
  }

  async replyToMessage(messageId: string, data: any) {
    const response = await this.client.post(`/messages/${messageId}/reply`, data);
    return response.data;
  }

  async archiveMessage(messageId: string) {
    const response = await this.client.post(`/messages/${messageId}/archive`);
    return response.data;
  }

  async getMessagesStats() {
    const response = await this.client.get('/messages/stats/summary');
    return response.data;
  }

  // Analytics endpoints
  async getDashboardKPIs() {
    const response = await this.client.get('/analytics/dashboard');
    return response.data;
  }

  async getUserGrowth(period = '30d') {
    const response = await this.client.get('/analytics/users/growth', { params: { period } });
    return response.data;
  }

  async getUserGeoDistribution() {
    const response = await this.client.get('/analytics/users/geo');
    return response.data;
  }

  async getRevenueStats(period = '30d') {
    const response = await this.client.get('/analytics/subscriptions/revenue', { params: { period } });
    return response.data;
  }

  async getContentStats() {
    const response = await this.client.get('/analytics/content/stats');
    return response.data;
  }

  async getAnalyticsOverview() {
    const response = await this.client.get('/analytics/overview');
    return response.data;
  }

  async exportAnalytics(type: string, filters?: any) {
    const response = await this.client.post(
      '/analytics/export',
      { type, filters },
      { responseType: 'blob' },
    );
    return response.data;
  }

  // Audit endpoints
  async getAuditLogs(params?: any) {
    const response = await this.client.get('/audit/logs', { params });
    return response.data;
  }

  async getAuditStats(period = '7d') {
    const response = await this.client.get('/audit/stats', { params: { period } });
    return response.data;
  }

  async getAuditEventTypes() {
    const response = await this.client.get('/audit/event-types');
    return response.data;
  }

  async exportAuditLogs(params?: any) {
    const response = await this.client.get('/audit/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  }

  // Settings endpoints
  async getSettings(category?: string) {
    const response = await this.client.get('/settings', {
      params: category ? { category } : undefined,
    });
    return response.data;
  }

  async updateSetting(key: string, value: any) {
    const response = await this.client.put(`/settings/${key}`, { setting_value: value });
    return response.data;
  }

  async toggleMaintenance(data: { enabled: boolean; message?: string | null }) {
    const response = await this.client.post('/settings/maintenance/toggle', data);
    return response.data;
  }

  async triggerBackup(data?: { reason?: string; include_storage?: boolean }) {
    const response = await this.client.post('/settings/backup/trigger', data ?? {});
    return response.data;
  }

  async getNotifications(isRead?: boolean) {
    const response = await this.client.get('/settings/notifications', {
      params: isRead !== undefined ? { is_read: isRead } : undefined,
    });
    return response.data;
  }

  async markNotificationRead(notificationId: string) {
    const response = await this.client.put(`/settings/notifications/${notificationId}/read`);
    return response.data;
  }

  async checkHealth() {
    const response = await this.client.get('/settings/health/check');
    return response.data;
  }
}

export const apiClient = new AdminApiClient();
export default apiClient;
