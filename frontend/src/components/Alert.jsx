import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react';
import { useEffect } from 'react';

const TYPES = {
  success: { icon: CheckCircle, bg: 'bg-mint-50', border: 'border-mint-200', text: 'text-mint-700', iconColor: 'text-mint-500' },
  error: { icon: XCircle, bg: 'bg-bubble-50', border: 'border-bubble-200', text: 'text-bubble-700', iconColor: 'text-bubble-500' },
  warning: { icon: AlertCircle, bg: 'bg-sun-50', border: 'border-sun-200', text: 'text-sun-700', iconColor: 'text-sun-500' },
  info: { icon: Info, bg: 'bg-sky2-50', border: 'border-sky2-200', text: 'text-sky2-700', iconColor: 'text-sky2-500' },
};

export default function Alert({ type = 'info', message, onClose, autoClose = 0 }) {
  const config = TYPES[type];
  const Icon = config.icon;

  useEffect(() => {
    if (autoClose > 0 && onClose) {
      const t = setTimeout(onClose, autoClose);
      return () => clearTimeout(t);
    }
  }, [autoClose, onClose]);

  if (!message) return null;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${config.bg} ${config.border} animate-fade-in`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <p className={`flex-1 text-sm font-medium ${config.text}`}>{message}</p>
      {onClose && (
        <button onClick={onClose} className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 transition-opacity`}>
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
