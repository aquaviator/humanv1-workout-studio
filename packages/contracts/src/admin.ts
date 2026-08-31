import { AdminRole, AdminPermission } from './roles';

export interface AdminProfile {
  uid: string;
  email: string;
  displayName: string;
  roles: AdminRole[];
  permissions: AdminPermission[];
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface AdminClaims {
  admin: boolean;
  roles: AdminRole[];
}
