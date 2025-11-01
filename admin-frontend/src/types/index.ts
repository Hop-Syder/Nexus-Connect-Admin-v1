// User types
export interface User {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  role?: string;
  country_code?: string;
  city?: string;
  has_profile: boolean;
  is_premium: boolean;
  premium_until?: string;
  subscription_tier: string;
  is_blocked: boolean;
  blocked_at?: string;
  block_reason?: string;
  last_login?: string;
  login_count: number;
  created_at: string;
  updated_at: string;
  tags?: UserTag[];
  segments?: UserSegment[];
}

export interface UserTag {
  tag: string;
  color?: string;
}

export interface UserSegment {
  id: string;
  name?: string;
  description?: string;
}

// Subscription types
export interface SubscriptionPlan {
  id: string;
  plan_code: string;
  plan_name: string;
  description?: string;
  price: number;
  currency: string;
  duration_days: number;
  features: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionHistory {
  id: string;
  user_id: string;
  action: 'granted' | 'renewed' | 'revoked' | 'expired';
  plan: string;
  duration_days?: number;
  premium_until?: string;
  amount?: number;
  currency: string;
  payment_method?: string;
  payment_reference?: string;
  admin_id?: string;
  reason?: string;
  created_at: string;
}

export interface SubscriptionStats {
  total_users: number;
  total_premium: number;
  total_free: number;
  mrr: number;
  expiring_7days: number;
  expiring_3days: number;
  expired_today: number;
}

export interface ExpiringSubscription {
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  premium_until: string;
  subscription_tier: string;
}

export interface SubscriptionCoupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_from: string;
  valid_until: string;
  max_uses?: number;
  usage_limit_per_user?: number;
  usage_count?: number;
  applicable_plans?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Entrepreneur/Moderation types
export interface Entrepreneur {
  id: string;
  user_id: string;
  profile_type: string;
  first_name: string;
  last_name: string;
  company_name?: string;
  activity_name?: string;
  logo_url?: string;
  description: string;
  tags: string[];
  phone: string;
  whatsapp: string;
  email: string;
  country_code: string;
  city: string;
  website?: string;
  portfolio: any[];
  rating: number;
  review_count: number;
  is_premium: boolean;
  premium_until?: string;
  status: 'draft' | 'published' | 'rejected' | 'deactivated';
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface ModerationQueueItem {
  id: string;
  entrepreneur_id: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'changes_requested';
  assigned_to?: string;
  priority: number;
  decision?: string;
  decision_reason?: string;
  decision_by?: string;
  decision_at?: string;
  macro_used?: string;
  ai_score?: number;
  ai_flags?: any;
  submitted_at: string;
  first_reviewed_at?: string;
  sla_deadline: string;
  sla_breach: boolean;
  notes?: string;
  time_elapsed_minutes?: number;
  time_remaining_minutes?: number;
  is_overdue?: boolean;
  created_at: string;
  updated_at: string;
  entrepreneur?: (Entrepreneur & {
    profile?: {
      user_id: string;
      first_name?: string;
      last_name?: string;
      is_premium?: boolean;
      has_profile?: boolean;
    };
    auth?: {
      email?: string;
      last_sign_in_at?: string;
    };
  }) | null;
}

// Message types
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'assigned' | 'in_progress' | 'replied' | 'archived';
  created_at: string;
  metadata?: {
    assigned_to?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    category?: string;
    tags?: string[];
    response_content?: string;
    response_template_id?: string;
    response_sent_at?: string;
    responded_by?: string;
    sla_breach?: boolean;
    sla_due_at?: string;
    internal_notes?: string;
    resolved_at?: string;
    status?: string;
  };
}

// Campaign types
export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  content: string;
  targeting_type: 'all' | 'segment' | 'premium' | 'country';
  targeting_filters?: any;
  recipient_count: number;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_for?: string;
  sent_at?: string;
  from_name: string;
  from_email: string;
  reply_to?: string;
  template_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
}

export interface CampaignStats {
  id: string;
  campaign_id: string;
  total_sent: number;
  total_delivered: number;
  total_bounced: number;
  total_failed: number;
  total_opened: number;
  total_clicked: number;
  total_unsubscribed: number;
  total_complained: number;
  delivery_rate?: number;
  open_rate?: number;
  click_rate?: number;
  unsubscribe_rate?: number;
  last_updated: string;
}

export interface CampaignOverviewStats {
  total_campaigns: number;
  sent_campaigns: number;
  scheduled_campaigns: number;
  emails_sent: number;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  description?: string;
  category?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsOverview {
  total_users: number;
  premium_users: number;
  content: Record<string, number>;
  campaigns_total: number;
}

// Analytics types
export interface DashboardKPIs {
  total_users: number;
  active_users_7d: number;
  premium_users: number;
  published_profiles: number;
  draft_profiles: number;
  pending_moderation: number;
  mrr_xof: number;
  new_messages: number;
  sla_breaches: number;
  critical_events_24h: number;
  last_updated: string;
}

// Audit types
export interface AuditLog {
  id: string;
  event_type: string;
  severity: 'LOW' | 'MED' | 'HIGH' | 'CRIT';
  user_id?: string;
  admin_id?: string;
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
  http_method?: string;
  status_code?: number;
  metadata?: any;
  changes?: any;
  log_hash: string;
  hash_valid?: boolean;
  computed_hash?: string;
  created_at: string;
}

// Settings types
export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  setting_type: 'string' | 'number' | 'boolean' | 'json';
  default_value?: string;
  is_required: boolean;
  validation_rules?: any;
  category?: string;
  description?: string;
  last_updated_by?: string;
  updated_at: string;
  parsed_value?: any;
  display_order?: number;
}

// Common types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  next_cursor?: string;
  summary?: Record<string, any>;
}

export interface ApiError {
  detail: string;
  code?: string;
  trace_id?: string;
}
