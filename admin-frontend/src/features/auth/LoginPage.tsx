'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth-store';
import apiClient from '@/lib/api-client';
import { toast } from 'sonner';

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  requires_2fa: boolean;
  user: {
    id: string;
    email: string;
    role: string;
    mfa_verified: boolean;
  };
};

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const router = useRouter();
  const {
    setAuth,
    set2FAVerified,
    isAuthenticated,
    initialized,
    requires2FA: storeRequires2FA,
  } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [userId, setUserId] = useState('');
  const [code2FA, setCode2FA] = useState('');
  const [pendingAuth, setPendingAuth] = useState<LoginResponse | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response: LoginResponse = await apiClient.login(data.email, data.password);

      if (response.requires_2fa) {
        setRequires2FA(true);
        setUserId(response.user.id);
        setPendingAuth(response);
        toast.info('Veuillez entrer votre code 2FA');
      } else {
        setAuth(response);
        toast.success('Connexion réussie!');
        router.replace('/');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Erreur de connexion');
    } finally {
      setIsLoading(false);
    }
  };

  const onVerify2FA = async () => {
    if (!code2FA) {
      toast.error('Veuillez entrer le code 2FA');
      return;
    }
    if (!pendingAuth) {
      toast.error('Session expirée, veuillez vous reconnecter.');
      setRequires2FA(false);
      setCode2FA('');
      setPendingAuth(null);
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.verify2FA(userId, code2FA);

      const authData: LoginResponse = {
        ...pendingAuth,
        requires_2fa: false,
        user: {
          ...pendingAuth.user,
          mfa_verified: true,
        },
      };

      setAuth(authData);
      set2FAVerified();
      toast.success('2FA vérifié! Connexion en cours...');
      setPendingAuth(null);
      setRequires2FA(false);
      setUserId('');
      setCode2FA('');
      router.replace('/');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Code 2FA invalide');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialized && isAuthenticated && !storeRequires2FA) {
      router.replace('/');
    }
  }, [initialized, isAuthenticated, storeRequires2FA, router]);

  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Vérification 2FA</CardTitle>
            <CardDescription>
              Entrez le code depuis votre application d'authentification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="Code 6 chiffres"
                  value={code2FA}
                  onChange={(e) => setCode2FA(e.target.value)}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
              </div>
              <Button
                onClick={onVerify2FA}
                disabled={isLoading || code2FA.length !== 6}
                className="w-full"
              >
                {isLoading ? 'Vérification...' : 'Vérifier'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRequires2FA(false);
                  setPendingAuth(null);
                  setUserId('');
                  setCode2FA('');
                }}
                className="w-full"
              >
                Retour
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
              NC
            </div>
          </div>
          <CardTitle className="text-2xl">Nexus Connect Admin</CardTitle>
          <CardDescription>Connectez-vous pour accéder au tableau de bord</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="admin@nexus-partners.xyz"
                {...register('email')}
                className="mt-1"
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Mot de passe</label>
              <Input
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className="mt-1"
              />
              {errors.password && (
                <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
