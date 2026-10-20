import { useEffect, useState, useCallback } from 'react';
import { Users, Sun, Moon, Brain, Loader2, CheckCircle2, AlertTriangle, ListChecks, Sparkles, CalendarDays } from 'lucide-react';
import { standupApi, aiApi, updatesApi, eveningApi } from '../api';
import { useSession } from '../context/SessionContext';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { RoleBadge } from '../components/RoleBits';
import { formatDateTime } from '../utils/helpers';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function SummaryList({ icon: Icon, title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className={`${tone} rounded-2xl p-4`}>
      <p className="text-xs font-bold uppercase tracking-wider text-ink/60 flex items-center gap-1.5 mb-2"><Icon className="w-3.5 h-3.5" />{title}</p>
      <ul className="space-y-1.5 text-sm text-ink/80 list-disc pl-4">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function MemberRow({ row, onReviewMorning, onReviewEvening }) {
  const { can } = useSession();
  const { member, morning, evening } = row;
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink text-sm">{member.name}</p>
          <p className="text-xs text-slate-400">{member.role}</p>
        </div>
        <RoleBadge role={member.projectRole} />
        <span className={`badge ${morning.length ? 'bg-sun-100 text-sun-700' : 'bg-slate-100 text-slate-400'}`}><Sun className="w-3 h-3" />{morning.length ? 'Morning posted' : 'No morning update'}</span>
        <span className={`badge ${evening.length ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}><Moon className="w-3 h-3" />{evening.length ? 'Evening posted' : 'No evening update'}</span>
      </div>

      {(morning.length > 0 || evening.length > 0) && (
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <div className="space-y-2">
            {morning.map(u => (
              <div key={u._id} className="bg-sun-50 rounded-2xl p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400">{formatDateTime(u.createdAt)}</span>
                  {can.canReview && (
                    <button className="btn-ghost text-xs py-0.5" onClick={() => onReviewMorning(u)}>
                      <CheckCircle2 className={`w-3.5 h-3.5 ${u.reviewedBy ? 'text-mint-500' : ''}`} />{u.reviewedBy ? 'Reviewed' : 'Mark reviewed'}
                    </button>
                  )}
                </div>
                <p><strong>Yesterday:</strong> {u.yesterday}</p>
                <p><strong>Today:</strong> {u.today}</p>
                {u.blockers && <p className="text-bubble-700"><strong>Blockers:</strong> {u.blockers}</p>}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {evening.map(ev => (
              <div key={ev._id} className="bg-brand-50 rounded-2xl p-3 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400">{formatDateTime(ev.createdAt)}</span>
                  {can.canReview && (
                    <button className="btn-ghost text-xs py-0.5" onClick={() => onReviewEvening(ev)}>
                      <CheckCircle2 className={`w-3.5 h-3.5 ${ev.reviewedBy ? 'text-mint-500' : ''}`} />{ev.reviewedBy ? 'Reviewed' : 'Mark reviewed'}
                    </button>
                  )}
                </div>
                {ev.entries.map(en => (
                  <p key={en._id}><strong className="font-mono text-xs">{en.task?.taskId}</strong> {en.done}{en.remaining ? <span className="text-slate-500"> — left: {en.remaining}</span> : null}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StandupPage() {
  const { can } = useSession();
  const [day, setDay] = useState(todayKey);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [alert, setAlert] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await standupApi.get(day)).data); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  }, [day]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setAlert(null);
    try {
      const res = await aiApi.standupSummary(day);
      setData(d => ({ ...d, summary: res.data }));
    } catch (e) { setAlert({ type: 'error', message: `Summary failed: ${e.message}` }); }
    finally { setGenerating(false); }
  };

  const reviewMorning = async (u) => { try { await updatesApi.review(u._id, !u.reviewedBy); load(); } catch (e) { setAlert({ type: 'error', message: e.message }); } };
  const reviewEvening = async (ev) => { try { await eveningApi.review(ev._id, !ev.reviewedBy); load(); } catch (e) { setAlert({ type: 'error', message: e.message }); } };

  const summary = data?.summary;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="w-7 h-7 text-brand-500" />Stand-up</h1>
          <p className="text-slate-500 text-sm mt-1">{can.isManager ? 'Run the meeting: see who has posted, review updates and generate the summary' : "The team's day at a glance"}</p>
        </div>
        <label className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <input type="date" className="input py-2" value={day} max={todayKey()} onChange={e => setDay(e.target.value || todayKey())} />
        </label>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      {loading || !data ? <LoadingSpinner message="Loading stand-up..." /> : (
        <>
          {/* Who's missing */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-sun-100 rounded-2xl p-4 shadow-note">
              <p className="text-sm font-semibold text-ink/70 flex items-center gap-1.5"><Sun className="w-4 h-4" />Missing morning update</p>
              <p className="text-sm text-ink mt-1">{data.missingMorning.length ? data.missingMorning.join(', ') : 'Everyone has posted 🎉'}</p>
            </div>
            <div className="bg-brand-100 rounded-2xl p-4 shadow-note">
              <p className="text-sm font-semibold text-ink/70 flex items-center gap-1.5"><Moon className="w-4 h-4" />Missing evening update</p>
              <p className="text-sm text-ink mt-1">{data.missingEvening.length ? data.missingEvening.join(', ') : 'Everyone has checked in 🎉'}</p>
            </div>
          </div>

          {/* AI meeting summary */}
          <div className="card border-l-4 border-l-brand-400 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold text-ink flex items-center gap-2"><Brain className="w-4 h-4 text-brand-500" />AI meeting summary</h2>
              {summary && <span className="text-xs text-slate-400">by {summary.generatedBy?.name || 'Scrum Master'} · {formatDateTime(summary.updatedAt)}</span>}
              {can.canGenerateSummary && (
                <button className="btn-primary ml-auto" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Summarizing…' : summary ? 'Regenerate' : 'Generate summary'}
                </button>
              )}
            </div>
            {summary ? (
              <>
                <p className="text-sm text-slate-700 leading-relaxed">{summary.summary}</p>
                <div className="grid md:grid-cols-3 gap-3">
                  <SummaryList icon={CheckCircle2} title="Highlights" items={summary.highlights} tone="bg-mint-50" />
                  <SummaryList icon={AlertTriangle} title="Risks" items={summary.risks} tone="bg-bubble-50" />
                  <SummaryList icon={ListChecks} title="Follow-ups" items={summary.followUps} tone="bg-sun-50" />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">{can.canGenerateSummary ? 'Generate a summary once people have posted their updates.' : 'Your Scrum Master hasn’t generated a summary for this day yet.'}</p>
            )}
          </div>

          {/* Per member */}
          <div className="space-y-4">
            {data.rows.length === 0
              ? <p className="text-sm text-slate-500">This project has no members yet.</p>
              : data.rows.map(row => <MemberRow key={row.member._id} row={row} onReviewMorning={reviewMorning} onReviewEvening={reviewEvening} />)}
          </div>
        </>
      )}
    </div>
  );
}
