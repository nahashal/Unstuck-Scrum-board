import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { orgApi } from '../api';
import Modal from './Modal';
import Alert from './Alert';
import { InlineLoader } from './LoadingSpinner';

// Org Admin confirmation for permanently deleting a project (type its key to enable the button)
export default function DeleteProjectModal({ project, onClose, onDeleted }) {
  const [confirmKey, setConfirmKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => { setConfirmKey(''); setError(''); onClose(); };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await orgApi.deleteProject(project._id, confirmKey);
      setConfirmKey('');
      await onDeleted(project);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!project} onClose={close} title="Delete project" size="sm">
      {project && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This permanently deletes <strong>{project.name}</strong> and all of its tasks, daily and evening updates, AI analyses,
            blockers, action items, sprints and comments. <strong>This cannot be undone.</strong>
          </p>
          <p className="text-xs text-slate-400">To keep its history but stop changes, use Archive in Project Settings instead.</p>
          {error && <Alert type="error" message={error} onClose={() => setError('')} />}
          <div>
            <label className="label" htmlFor="confirm-project-key">
              Type <span className="normal-case font-mono text-ink">{project.key}</span> to confirm
            </label>
            <input id="confirm-project-key" className="input font-mono uppercase" value={confirmKey}
              onChange={e => setConfirmKey(e.target.value.toUpperCase())} autoComplete="off" />
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={close}>Cancel</button>
            <button className="btn-danger" disabled={busy || confirmKey.trim() !== project.key} onClick={remove}>
              {busy ? <InlineLoader size="sm" /> : <Trash2 className="w-4 h-4" />} Delete forever
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
