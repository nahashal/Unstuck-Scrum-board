import { getInitials, getAvatarColor } from '../utils/helpers';

export default function Avatar({ name, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-10 h-10 text-base' : 'w-8 h-8 text-xs';
  const color = getAvatarColor(name);
  // Yellow needs dark text to stay readable
  const textColor = color.includes('sun') ? 'text-ink' : 'text-white';
  return (
    <div className={`${sizeClass} ${color} ${textColor} rounded-full ring-2 ring-white shadow-sm flex items-center justify-center font-bold font-display flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}
