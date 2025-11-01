import type { Metadata } from 'next';
import { LoginPage } from '@/features/auth/LoginPage';

export const metadata: Metadata = {
  title: 'Connexion | Nexus Connect Admin',
};

export default function Login() {
  return <LoginPage />;
}
