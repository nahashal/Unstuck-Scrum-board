import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      <p className="text-sm text-slate-500 font-medium">{message}</p>
    </div>
  );
}

export function InlineLoader({ size = 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return <Loader2 className={`${sz} animate-spin text-current`} />;
}
