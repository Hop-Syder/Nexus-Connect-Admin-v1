import React from 'react';
import { Loader2 } from 'lucide-react';

interface FullScreenLoaderProps {
  message?: string;
}

export function FullScreenLoader({ message }: FullScreenLoaderProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
