import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalAuthRepository } from '../LocalAuthRepository';

describe('LocalAuthRepository', () => {
  const STORAGE_KEY = 'humanv1_local_auth_state';
  
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_DEV_MODE', 'true');
  });
  
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed when not in development mode', async () => {
    vi.stubEnv('VITE_DEV_MODE', 'false');
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ humanUserId: 'hacked' }));
    
    const repo = new LocalAuthRepository();
    expect(repo.getCurrentIdentity()).resolves.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // Should remove stored dev identity
    
    await expect(repo.signIn()).rejects.toThrow('Local authentication is disabled outside development environments.');
  });
  
  it('allows sign in during development mode', async () => {
    const repo = new LocalAuthRepository();
    await repo.signIn();
    
    const identity = await repo.getCurrentIdentity();
    expect(identity).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
