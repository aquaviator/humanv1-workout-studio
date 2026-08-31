import { AdminRole, AdminPermission } from './roles';

export interface AuditLogEntry {
  eventId: string;
  timestamp: string;
  adminUid: string;
  adminRole: AdminRole[];
  permissionUsed: AdminPermission;
  action: string;
  targetType: string;
  targetStableId: string;
  reason: string;
  ticketReference?: string;
  idempotencyKey: string;
  requestCorrelationId: string;
  beforeSummary: any;
  afterSummary: any;
  success: boolean;
  backendVersion: string;
}
