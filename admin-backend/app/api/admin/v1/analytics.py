from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging
import csv
import io

from app.middleware.jwt_auth import get_current_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics")


class ExportRequest(BaseModel):
  type: str
  filters: Optional[Dict[str, Any]] = None


@router.get("/dashboard")
@require_permission("analytics:read")
async def get_dashboard_kpis(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
  try:
    supabase = get_supabase_admin()
    resp = supabase.table("admin.dashboard_kpis").select("*").limit(1).execute()
    if resp.data:
      return resp.data[0]
    return await _calculate_kpis_fallback()
  except Exception as exc:
    logger.exception("Dashboard KPIs error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load KPIs")


@router.get("/users/growth")
@require_permission("analytics:read")
async def get_user_growth(
  request: Request,
  period: str = Query('30d', pattern='^(7d|30d|90d|1y)$'),
  current_user: dict = Depends(get_current_user),
):
  try:
    supabase = get_supabase_admin()
    days_map = {'7d': 7, '30d': 30, '90d': 90, '1y': 365}
    start_date = datetime.utcnow() - timedelta(days=days_map[period])
    result = (
      supabase.table('user_profiles')
      .select('created_at')
      .gte('created_at', start_date.isoformat())
      .execute()
    )
    daily_counts: Dict[str, int] = {}
    for row in result.data or []:
      date_key = datetime.fromisoformat(row['created_at']).date().isoformat()
      daily_counts[date_key] = daily_counts.get(date_key, 0) + 1
    return [{'date': date, 'count': daily_counts[date]} for date in sorted(daily_counts.keys())]
  except Exception as exc:
    logger.exception("User growth error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load growth data")


@router.get("/users/geo")
@require_permission("analytics:read")
async def get_user_geo_distribution(
  request: Request, current_user: dict = Depends(get_current_user)
):
  try:
    supabase = get_supabase_admin()
    result = supabase.table('entrepreneurs').select('country_code').execute()
    counts: Dict[str, int] = {}
    for row in result.data or []:
      country = row.get('country_code') or 'UNK'
      counts[country] = counts.get(country, 0) + 1
    top = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:8]
    return [{'country': country, 'count': count} for country, count in top]
  except Exception as exc:
    logger.exception("Geo distribution error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load geo data")


@router.get("/subscriptions/revenue")
@require_permission("analytics:read")
async def get_revenue_stats(
  request: Request,
  period: str = Query('30d', pattern='^(7d|30d|90d)$'),
  current_user: dict = Depends(get_current_user),
):
  try:
    supabase = get_supabase_admin()
    mrr_rpc = supabase.rpc('admin.calculate_subscription_stats').execute()
    mrr = mrr_rpc.data[0]['mrr'] if mrr_rpc.data else 0
    days_map = {'7d': 7, '30d': 30, '90d': 90}
    start_date = datetime.utcnow() - timedelta(days=days_map[period])
    revenue_rows = (
      supabase.table('admin.subscription_history')
      .select('amount, currency, created_at')
      .in_('action', ['granted', 'renewed'])
      .gte('created_at', start_date.isoformat())
      .execute()
    ).data or []
    total_revenue = sum(item.get('amount') or 0 for item in revenue_rows)
    return {
      'mrr': mrr,
      'total_revenue_period': total_revenue,
      'currency': 'XOF',
      'transactions_count': len(revenue_rows),
    }
  except Exception as exc:
    logger.exception("Revenue stats error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load revenue stats")


@router.get("/content/stats")
@require_permission("analytics:read")
async def get_content_stats(
  request: Request, current_user: dict = Depends(get_current_user)
):
  try:
    return await _collect_content_stats()
  except Exception as exc:
    logger.exception("Content stats error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load content stats")


@router.get("/overview")
@require_permission("analytics:read")
async def get_overview_stats(
  request: Request, current_user: dict = Depends(get_current_user)
):
  try:
    supabase = get_supabase_admin()
    total_users = supabase.table('user_profiles').select('id', count='exact').execute().count or 0
    premium_users = (
      supabase.table('user_profiles')
      .select('id', count='exact')
      .eq('is_premium', True)
      .execute()
      .count
      or 0
    )
    content_stats = await _collect_content_stats()
    campaign_total = supabase.table('admin.email_campaigns').select('id', count='exact').execute().count or 0
    return {
      'total_users': total_users,
      'premium_users': premium_users,
      'content': content_stats,
      'campaigns_total': campaign_total,
    }
  except Exception as exc:
    logger.exception("Overview stats error: %s", exc)
    raise HTTPException(status_code=500, detail="Failed to load overview stats")


@router.post("/export")
@require_permission("analytics:export")
async def export_analytics_csv(
  request: Request,
  payload: ExportRequest,
  current_user: dict = Depends(get_current_user)
):
  try:
    supabase = get_supabase_admin()
    export_type = payload.type
    filters = payload.filters or {}
    if export_type == 'users':
      query = supabase.table('user_profiles').select('*')
    elif export_type == 'subscriptions':
      query = supabase.table('admin.subscription_history').select('*')
    elif export_type == 'entrepreneurs':
      query = supabase.table('entrepreneurs').select('*')
    else:
      raise HTTPException(status_code=400, detail='Invalid export type')
    for key, value in filters.items():
      query = query.eq(key, value)
    result = query.execute()
    output = io.StringIO()
    if result.data:
      writer = csv.DictWriter(output, fieldnames=result.data[0].keys())
      writer.writeheader()
      writer.writerows(result.data)
    supabase.table('audit_logs').insert({
      'event_type': 'analytics.export',
      'severity': 'HIGH',
      'admin_id': current_user['id'],
      'metadata': {'type': export_type, 'count': len(result.data)},
    }).execute()
    return StreamingResponse(
      iter([output.getvalue()]),
      media_type='text/csv',
      headers={'Content-Disposition': f"attachment; filename={export_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"},
    )
  except HTTPException:
    raise
  except Exception as exc:
    logger.exception("Export analytics error: %s", exc)
    raise HTTPException(status_code=500, detail='Failed to export data')


async def _calculate_kpis_fallback() -> Dict[str, Any]:
  supabase = get_supabase_admin()
  total_users = supabase.table('user_profiles').select('id', count='exact').execute().count or 0
  premium_users = (
    supabase.table('user_profiles')
    .select('id', count='exact')
    .eq('is_premium', True)
    .execute()
    .count
    or 0
  )
  published_profiles = (
    supabase.table('entrepreneurs')
    .select('id', count='exact')
    .eq('status', 'published')
    .execute()
    .count
    or 0
  )
  return {
    'total_users': total_users,
    'premium_users': premium_users,
    'published_profiles': published_profiles,
    'mrr_xof': 0,
    'last_updated': datetime.utcnow().isoformat(),
  }


async def _collect_content_stats() -> Dict[str, Any]:
  supabase = get_supabase_admin()
  stats: Dict[str, Any] = {}

  try:
    status_resp = (
      supabase.table('entrepreneurs')
      .select('status, count:id', count='exact', group='status')
      .execute()
    )
    total = 0
    for row in status_resp.data or []:
      status_value = row.get('status') or 'unknown'
      try:
        count_value = int(row.get('count') or 0)
      except (TypeError, ValueError):
        count_value = 0
      stats[status_value] = count_value
      total += count_value
    stats['total'] = total
  except Exception as exc:
    logger.debug("Failed to collect entrepreneur status stats: %s", exc)

  try:
    queue_resp = (
      supabase.table('admin.moderation_queue')
      .select('status, count:id', count='exact', group='status')
      .execute()
    )
    for row in queue_resp.data or []:
      status_value = row.get('status') or 'unknown'
      try:
        count_value = int(row.get('count') or 0)
      except (TypeError, ValueError):
        count_value = 0
      stats[f'queue_{status_value}'] = count_value

    breach_resp = (
      supabase.table('admin.moderation_queue')
      .select('id', count='exact')
      .eq('sla_breach', True)
      .execute()
    )
    stats['queue_sla_breach'] = breach_resp.count or 0
  except Exception as exc:
    logger.debug("Failed to collect moderation queue stats: %s", exc)

  return stats
