import { useState, useCallback, useEffect } from 'react';
import { Brain, Zap, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2, Edit3, Link2, Undo2, History } from 'lucide-react';
import { aiApi, updatesApi, teamApi, blockersApi, tasksApi } from '../api';
import Alert from '../components/Alert';
import LoadingSpinner from '../components/LoadingSpinner';
import { InlineLoader } from '../components/LoadingSpinner';
import Avatar from '../components/Avatar';
import { formatDateTime, statusConfig } from '../utils/helpers';
import { useSession } from '../context/SessionContext';

// Shows the live status of the blocker a finding is linked to (it changes as the team works on it)
function BlockerStatusBadge({ blocker }) {
  if (!blocker?.status) return null;
  const cfg = statusConfig[blocker.status] || statusConfig.Open;
  return <span className={`badge ${cfg.bg} ${cfg.text}`}>Blocker: {blocker.status}</span>;
}

function FindingCard({ finding, index, onConfirm, onReject, onUndoReject, tasks, members, disabled }) {
  const { can } = useSession();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState({ ...finding });
  const [confirming, setConfirming] = useState(false);

  const set = (key, val) => setEdited(f => ({ ...f, [key]: val }));

  const handleConfirm = async () => {
    setConfirming(true);
    await onConfirm(index, edited);
    setConfirming(false);
  };

  if (finding.status === 'confirmed') {
    return (
      <div className="card border-l-4 border-l-mint-400 bg-mint-50/30 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-mint-500" />
          <span className="font-semibold text-mint-700">{finding.potentialBlocker}</span>
          <span className="ml-auto flex items-center gap-2">
            <BlockerStatusBadge blocker={finding.blocker} />
            <span className="badge bg-mint-100 text-mint-700">Confirmed</span>
          </span>
        </div>
      </div>
    );
  }
  if (finding.status === 'tracked') {
    return (
      <div className="card border-l-4 border-l-sky2-400 bg-sky2-50/30 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="w-5 h-5 text-sky2-500" />
          <span className="font-semibold text-slate-700">{finding.potentialBlocker}</span>
          <span className="ml-auto flex items-center gap-2">
            <BlockerStatusBadge blocker={finding.blocker} />
            <span className="badge bg-sky2-100 text-sky2-700">Already tracked</span>
          </span>
        </div>
        {finding.blocker?.title && (
          <p className="text-xs text-slate-500 mt-2 ml-7">
            Matches existing blocker “{finding.blocker.title}”, so no new blocker is needed.
          </p>
        )}
      </div>
    );
  }
  if (finding.status === 'rejected') {
    return (
      <div className="card border-l-4 border-l-slate-300 animate-fade-in">
        <div className="flex items-center gap-2">
          <XCircle className="w-5 h-5 text-slate-400" />
          <span className="font-semibold text-slate-500 line-through opacity-70">{finding.potentialBlocker}</span>
          <span className="ml-auto flex items-center gap-2">
            {onUndoReject && can.canConfirmFindings && (
              <button className="btn-ghost text-xs" onClick={() => onUndoReject(index)} disabled={disabled}>
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </button>
            )}
            <span className="badge bg-slate-100 text-slate-500">Rejected</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card border border-sun-200 bg-sun-50/20 hover:shadow-md transition-all duration-200 animate-slide-up">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-sun-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-sun-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-slate-800 text-sm">{edited.potentialBlocker}</h4>
            <div className="flex items-center gap-1">
              {can.canConfirmFindings && <button
                onClick={() => setEditing(!editing)}
                className="btn-ghost text-xs"
                title="Edit finding"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>}
              <button onClick={() => setExpanded(!expanded)} className="btn-ghost text-xs">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {finding.affectedTaskId && (
            <span className="text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full mt-1 inline-block">
              🔗 Task {finding.affectedTaskId}
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      {expanded && (
        <div className="mt-4 space-y-3">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="label">Blocker Title</label>
                <input className="input" value={edited.potentialBlocker} onChange={e => set('potentialBlocker', e.target.value)} />
              </div>
              <div>
                <label className="label">Reason</label>
                <textarea className="input resize-none" rows={2} value={edited.reason} onChange={e => set('reason', e.target.value)} />
              </div>
              <div>
                <label className="label">Impact</label>
                <textarea className="input resize-none" rows={2} value={edited.impact} onChange={e => set('impact', e.target.value)} />
              </div>
              <div>
                <label className="label">Suggested Action</label>
                <textarea className="input resize-none" rows={2} value={edited.suggestedAction} onChange={e => set('suggestedAction', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Affected Task</label>
                  <select className="input" value={edited.affectedTaskObjectId || ''} onChange={e => set('affectedTaskObjectId', e.target.value)}>
                    <option value="">None</option>
                    {tasks.map(t => <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Possible Owner</label>
                  <select className="input" value={edited.possibleOwnerMemberId || ''} onChange={e => set('possibleOwnerMemberId', e.target.value)}>
                    <option value="">Unclear</option>
                    {members.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-ghost text-xs" onClick={() => setEditing(false)}>Done editing</button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-slate-700">{edited.reason}</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Impact</p>
                <p className="text-sm text-slate-700">{edited.impact}</p>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested Action</p>
                <p className="text-sm text-slate-700">{edited.suggestedAction}</p>
              </div>
              {(edited.possibleOwner || edited.possibleOwnerValidated) && (
                <div className="bg-white rounded-xl p-3 border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Possible Owner</p>
                  <div className="flex items-center gap-2">
                    <Avatar name={edited.possibleOwnerValidated || edited.possibleOwner} size="sm" />
                    <span className="text-sm text-slate-700">
                      {edited.possibleOwnerValidated || edited.possibleOwner}
                      {edited.possibleOwnerValidated
                        ? <span className="ml-1 text-xs text-mint-500">✓ verified</span>
                        : <span className="ml-1 text-xs text-sun-500">⚠ not in team</span>
                      }
                    </span>
                  </div>
                </div>
              )}
              {edited.missingInfo && (
                <div className="md:col-span-2 bg-sun-50 border border-sun-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-sun-700 uppercase tracking-wide mb-1">Missing Information</p>
                  <p className="text-sm text-sun-700">{edited.missingInfo}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            {!can.canConfirmFindings && <span className="text-xs text-slate-500">A Scrum Master or Project Admin will confirm or reject this finding.</span>}
            {can.canConfirmFindings && <>
            <button
              id={`confirm-finding-${index}`}
              className="btn-primary bg-mint-500 hover:bg-mint-700"
              onClick={handleConfirm}
              disabled={confirming || disabled}
            >
              {confirming ? <InlineLoader size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Blocker
            </button>
            <button
              id={`reject-finding-${index}`}
              className="btn-secondary text-bubble-500 border-bubble-200 hover:bg-bubble-50"
              onClick={() => onReject(index)}
              disabled={confirming || disabled}
            >
              <XCircle className="w-4 h-4" /> Reject
            </button>
            </>}
            <span className="text-xs text-slate-400 ml-auto">AI-generated — review before confirming</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIPage({ aiState, setAiState }) {
  const { can } = useSession();
  const [updates, setUpdates] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { selectedUpdate, manualMode, manualForm, manualFindings } = aiState;
  const patchState = useCallback((patch) => setAiState(s => ({ ...s, ...patch })), [setAiState]);
  const setMF = (key, val) => patchState({ manualForm: { ...manualForm, [key]: val } });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [uRes, mRes, tRes] = await Promise.all([
        updatesApi.getAll(), teamApi.getAll(), tasksApi.getAll()
      ]);
      // Developers analyze their own updates; Scrum Masters+ can analyze anyone's
      const analyzable = uRes.data.filter(u => can.canAnalyzeUpdate(u));
      setUpdates(analyzable);
      setMembers(mRes.data);
      setTasks(tRes.data);
      // After a refresh, reopen the most recently analyzed update so its saved findings are visible
      setAiState(s => {
        if (s.selectedUpdate && analyzable.some(u => u._id === s.selectedUpdate)) return s;
        const latest = [...analyzable]
          .filter(u => u.aiAnalysis?.analyzedAt)
          .sort((a, b) => new Date(b.aiAnalysis.analyzedAt) - new Date(a.aiAnalysis.analyzedAt))[0];
        return { ...s, selectedUpdate: latest ? latest._id : '' };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [setAiState, can]);

  useEffect(() => { load(); }, [load]);

  const selectedUpdateObj = updates.find(u => u._id === selectedUpdate);
  const savedAnalysis = selectedUpdateObj?.aiAnalysis?.analyzedAt ? selectedUpdateObj.aiAnalysis : null;
  const findings = manualMode ? manualFindings : (savedAnalysis?.findings || []);

  // Replace one finding in whichever list is showing (saved update or unsaved manual analysis)
  const replaceFinding = (index, next) => {
    if (manualMode) {
      patchState({ manualFindings: manualFindings.map((f, i) => (i === index ? next : f)) });
      return;
    }
    setUpdates(us => us.map(u => u._id !== selectedUpdate ? u : {
      ...u,
      aiAnalysis: { ...u.aiAnalysis, findings: u.aiAnalysis.findings.map((f, i) => (i === index ? next : f)) },
    }));
  };

  const getAnalysisPayload = () => {
    if (manualMode) {
      return {
        teamMemberName: manualForm.teamMemberName,
        yesterday: manualForm.yesterday,
        today: manualForm.today,
        blockers: manualForm.blockers,
      };
    }
    if (!selectedUpdateObj) return null;
    return {
      updateId: selectedUpdateObj._id,
      teamMemberName: selectedUpdateObj.teamMember?.name || '',
      yesterday: selectedUpdateObj.yesterday,
      today: selectedUpdateObj.today,
      blockers: selectedUpdateObj.blockers,
    };
  };

  const handleAnalyze = async () => {
    const payload = getAnalysisPayload();
    if (!payload) {
      setError('Please select an update or fill in the manual form.');
      return;
    }
    setAnalyzing(true);
    setError('');
    setSuccess('');
    try {
      const res = await aiApi.analyze(payload);
      const { findings: newFindings, analyzedAt, model } = res.data;
      if (manualMode) {
        patchState({ manualFindings: newFindings });
      } else {
        setUpdates(us => us.map(u => u._id !== payload.updateId ? u : {
          ...u, aiAnalyzed: true, aiAnalysis: { analyzedAt, model, findings: newFindings },
        }));
      }
      if (newFindings.length === 0) {
        setSuccess('✅ AI analysis complete — no blockers or risks were identified.');
      }
    } catch (e) {
      setError(`AI Analysis failed: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async (index, edited) => {
    try {
      const payload = {
        title: edited.potentialBlocker,
        description: edited.reason,
        impact: edited.impact,
        suggestedAction: edited.suggestedAction,
        affectedTask: edited.affectedTaskObjectId || null,
        owner: edited.possibleOwnerMemberId || null,
        relatedUpdate: manualMode ? null : selectedUpdate || null,
        findingId: manualMode ? undefined : edited._id,
        aiRaw: edited,
      };
      const res = await blockersApi.create(payload);
      replaceFinding(index, {
        ...edited,
        status: 'confirmed',
        blocker: { _id: res.data._id, title: res.data.title, status: res.data.status },
      });
      setSuccess('Blocker confirmed and saved. Track it on the Blockers page.');
    } catch (e) {
      setError(`Failed to save blocker: ${e.message}`);
    }
  };

  const setReviewStatus = async (index, status) => {
    const finding = findings[index];
    if (manualMode) {
      replaceFinding(index, { ...finding, status });
      return;
    }
    try {
      await updatesApi.reviewFinding(selectedUpdate, finding._id, status);
      replaceFinding(index, { ...finding, status });
    } catch (e) {
      setError(`Failed to save your decision: ${e.message}`);
    }
  };

  if (loading) return <LoadingSpinner message="Loading AI panel..." />;

  const pendingCount = findings.filter(f => f.status === 'pending').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6 text-brand-500" />
          AI Blocker Intelligence
        </h1>
        <p className="text-slate-500 text-sm mt-1">Analyzes your updates and identifies potential blockers</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} autoClose={5000} />}

      {/* Input Panel */}
      <div className="card border-l-4 border-l-brand-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-500" /> Analyze Update
          </h2>
          <button
            className="btn-ghost text-xs"
            onClick={() => patchState({ manualMode: !manualMode })}
          >
            {manualMode ? '📋 Use saved update' : '✏️ Enter manually'}
          </button>
        </div>

        {manualMode ? (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              Manual analyses are for quick checks and aren’t saved. Submit a Daily Update to keep its analysis.
            </p>
            <div>
              <label className="label">Team Member Name</label>
              <input className="input" value={manualForm.teamMemberName} onChange={e => setMF('teamMemberName', e.target.value)} placeholder="e.g. Alice Johnson" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Yesterday's Progress</label>
                <textarea className="input resize-none" rows={3} value={manualForm.yesterday} onChange={e => setMF('yesterday', e.target.value)} placeholder="What was done yesterday?" />
              </div>
              <div>
                <label className="label">Today's Plan</label>
                <textarea className="input resize-none" rows={3} value={manualForm.today} onChange={e => setMF('today', e.target.value)} placeholder="What's planned for today?" />
              </div>
            </div>
            <div>
              <label className="label">Blockers</label>
              <textarea className="input resize-none" rows={2} value={manualForm.blockers} onChange={e => setMF('blockers', e.target.value)} placeholder="Any blockers or impediments?" />
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Select a Daily Update to Analyze</label>
            <select id="ai-update-select" className="input" value={selectedUpdate} onChange={e => patchState({ selectedUpdate: e.target.value })}>
              <option value="">— Choose an update —</option>
              {updates.map(u => (
                <option key={u._id} value={u._id}>
                  {u.teamMember?.name || 'Unknown'} — {formatDateTime(u.createdAt)}{u.blockers ? ' ⚠' : ''}{u.aiAnalysis?.analyzedAt ? ' · analyzed' : ''}
                </option>
              ))}
            </select>

            {selectedUpdateObj && (
              <div className="mt-4 grid md:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 col-span-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Yesterday</p>
                  <p className="text-sm text-slate-700 line-clamp-3">{selectedUpdateObj.yesterday}</p>
                </div>
                <div className="bg-sky2-50 rounded-xl p-3 col-span-1">
                  <p className="text-xs font-semibold text-sky2-500 uppercase tracking-wide mb-1">Today</p>
                  <p className="text-sm text-slate-700 line-clamp-3">{selectedUpdateObj.today}</p>
                </div>
                {selectedUpdateObj.blockers && (
                  <div className="bg-bubble-50 border border-bubble-100 rounded-xl p-3 col-span-1">
                    <p className="text-xs font-semibold text-bubble-500 uppercase tracking-wide mb-1">Blockers</p>
                    <p className="text-sm text-bubble-700 line-clamp-3">{selectedUpdateObj.blockers}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            id="analyze-btn"
            className="btn-primary"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Brain className="w-4 h-4" /> {!manualMode && savedAnalysis ? 'Re-run AI Analysis' : 'Run AI Analysis'}</>
            )}
          </button>
          {analyzing && <p className="text-xs text-slate-400 animate-pulse-soft">This can take up to a minute...</p>}
          {!analyzing && !manualMode && savedAnalysis && (
            <p className="text-xs text-slate-400">
              Re-running replaces the findings below. Confirmed blockers stay on the Blockers page.
            </p>
          )}
        </div>
      </div>

      {/* Findings */}
      {!manualMode && savedAnalysis && findings.length === 0 && (
        <div className="card text-sm text-slate-500 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-mint-500" />
          Last analysis ({formatDateTime(savedAnalysis.analyzedAt)}) found no blockers or risks in this update.
        </div>
      )}
      {findings.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-header mb-0 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-sun-500" />
              AI Findings ({findings.length})
            </h2>
            <span className="text-xs text-slate-400 flex items-center gap-2">
              {!manualMode && savedAnalysis && (
                <span className="flex items-center gap-1"><History className="w-3.5 h-3.5" /> Analyzed {formatDateTime(savedAnalysis.analyzedAt)}</span>
              )}
              {pendingCount > 0 && (
                <span className="bg-sun-50 border border-sun-100 px-3 py-1 rounded-full">
                  {pendingCount} awaiting review
                </span>
              )}
            </span>
          </div>
          {findings.map((f, i) => (
            <FindingCard
              key={`${selectedUpdate}-${savedAnalysis?.analyzedAt || 'manual'}-${f._id || i}`}
              index={i}
              finding={f}
              tasks={tasks}
              members={members}
              onConfirm={handleConfirm}
              onReject={(idx) => setReviewStatus(idx, 'rejected')}
              onUndoReject={(idx) => setReviewStatus(idx, 'pending')}
              disabled={analyzing}
            />
          ))}
        </div>
      )}
    </div>
  );
}
