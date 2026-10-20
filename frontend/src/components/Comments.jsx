import { useEffect, useState, useCallback } from 'react';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { commentsApi } from '../api';
import { useSession } from '../context/SessionContext';
import Avatar from './Avatar';
import { InlineLoader } from './LoadingSpinner';
import { formatDateTime } from '../utils/helpers';

// Comment thread for a task, morning update, evening check-in or blocker
export default function Comments({ targetType, targetId, compact = false }) {
  const { can } = useSession();
  const [comments, setComments] = useState([]);
  const [open, setOpen] = useState(!compact);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await commentsApi.getAll(targetType, targetId);
      setComments(res.data);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    }
  }, [targetType, targetId]);

  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await commentsApi.create(targetType, targetId, body.trim());
      setComments(c => [...c, res.data]);
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await commentsApi.delete(id);
      setComments(c => c.filter(x => x._id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs mt-2" onClick={() => setOpen(true)}>
        <MessageCircle className="w-3.5 h-3.5" /> Comments
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-ink/[0.06] pt-3 space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <MessageCircle className="w-3.5 h-3.5" /> Comments {loaded && `(${comments.length})`}
      </p>
      {error && <p className="text-xs text-bubble-700">{error}</p>}
      {comments.map(c => (
        <div key={c._id} className="flex items-start gap-2 group">
          <Avatar name={c.author?.name} size="sm" />
          <div className="flex-1 min-w-0 bg-canvas rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink">{c.author?.name || 'Former member'}</span>
              <span className="text-[11px] text-slate-400">{formatDateTime(c.createdAt)}</span>
              {can.canDeleteComment(c) && (
                <button type="button" onClick={() => remove(c._id)} title="Delete comment"
                  className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 hover:text-bubble-500 transition-opacity">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        </div>
      ))}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input className="input py-2" value={body} onChange={e => setBody(e.target.value)} placeholder="Write a comment…" maxLength={2000} />
        <button type="submit" className="btn-primary px-3" disabled={saving || !body.trim()} title="Post comment">
          {saving ? <InlineLoader size="sm" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
