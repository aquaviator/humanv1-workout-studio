import { AuthRepository, HumanIdentity } from '../domain/identity';
import { LocalAuthRepository } from './LocalAuthRepository';
import { FirebaseAuthRepository } from './FirebaseAuthRepository';
import { env } from '../config/env';

export const authRepository: AuthRepository = env.isDev && !env.useEmulator 
  ? new LocalAuthRepository() 
  : new FirebaseAuthRepository();
