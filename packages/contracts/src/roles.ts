export type AdminRole =
  | 'SUPPORT'
  | 'CONTENT_EDITOR'
  | 'SPECIALIST_REVIEWER'
  | 'RELEASE_MANAGER'
  | 'BILLING_ADMIN'
  | 'SECURITY_ADMIN'
  | 'SUPER_ADMIN';

export type AdminPermission =
  | 'users.read_summary'
  | 'users.disable'
  | 'sessions.revoke'
  | 'entitlements.read'
  | 'entitlements.grant_support'
  | 'billing.refresh_play'
  | 'billing.cancel'
  | 'billing.defer'
  | 'billing.revoke'
  | 'catalogue.review'
  | 'catalogue.publish'
  | 'catalogue.activate'
  | 'catalogue.rollback'
  | 'admins.manage'
  | 'audit.read';

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    'users.read_summary', 'users.disable', 'sessions.revoke',
    'entitlements.read', 'entitlements.grant_support',
    'billing.refresh_play', 'billing.cancel', 'billing.defer', 'billing.revoke',
    'catalogue.review', 'catalogue.publish', 'catalogue.activate', 'catalogue.rollback',
    'admins.manage', 'audit.read'
  ],
  SECURITY_ADMIN: [
    'users.read_summary', 'users.disable', 'sessions.revoke',
    'admins.manage', 'audit.read'
  ],
  SUPPORT: [
    'users.read_summary', 'entitlements.read', 'entitlements.grant_support'
  ],
  CONTENT_EDITOR: [
    'catalogue.review'
  ],
  SPECIALIST_REVIEWER: [
    'catalogue.review'
  ],
  RELEASE_MANAGER: [
    'catalogue.publish', 'catalogue.activate', 'catalogue.rollback'
  ],
  BILLING_ADMIN: [
    'users.read_summary', 'entitlements.read', 'billing.refresh_play', 'billing.cancel', 'billing.defer', 'billing.revoke'
  ]
};
