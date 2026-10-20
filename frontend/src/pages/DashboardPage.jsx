import { useEffect, useState } from 'react';
import { LayoutDashboard, ListTodo, PlayCircle, CheckCircle2, ShieldAlert, TrendingUp, MessageSquare, CheckSquare } from 'lucide-react';
import { dashboardApi } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import { formatDateTime } from '../utils/helpers';

// Each metric is a sticky note in one of the board accent colours
function MetricCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const colors = {
    brand: { note: 'bg-brand-100', icon: 'text-brand-600', val: 'text-brand-800' },
    sun: { note: 'bg-sun-100', icon: 'text-sun-700', val: 'text-ink' },
    mint: { note: 'bg-mint-100', icon: 'text-mint-700', val: 'text-ink' },
    bubble: { note: 'bg-bubble-100', icon: 'text-bubble-500', val: 'text-bubble-700' },
    sky: { note: 'bg-sky2-100', icon: 'text-sky2-700', val: 'text-ink' },
  };
  const c = colors[color];
  return (
    <div className={`${c.note} rounded-2xl p-5 shadow-note border border-ink/[0.04] flex flex-col gap-4 hover:-translate-y-0.5 hover:rotate-[-0.6deg] transition-transform duration-200`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink/70">{label}</p>
        <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm">
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      <div>
        <p className={`font-display text-3xl font-bold leading-none ${c.val}`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-ink/50 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await dashboardApi.get();
      setData(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Your team's real-time sprint overview</p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {data && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <MetricCard icon={ListTodo} label="Total Tasks" value={data.totalTasks} color="brand" />
            <MetricCard icon={PlayCircle} label="In Progress" value={data.inProgressTasks} color="sun" />
            <MetricCard icon={CheckCircle2} label="Completed" value={data.completedTasks} color="mint" />
            <MetricCard icon={ShieldAlert} label="Open Blockers" value={data.openBlockers} color="bubble" />
            <MetricCard icon={CheckSquare} label="Action Items" value={data.outstandingActions} sub="Open / In Progress" color="sky" />
            <MetricCard icon={TrendingUp} label="Sprint Progress" value={`${data.sprintProgress}%`} sub={data.activeSprint ? data.activeSprint.name : 'All tasks (no active sprint)'} color="brand" />
          </div>

          {/* Sprint Progress Bar */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-ink">Sprint Progress{data.activeSprint ? ` · ${data.activeSprint.name}` : ''}</h3>
                <p className="text-xs text-slate-400">{data.activeSprint ? (data.activeSprint.goal || `Ends ${new Date(data.activeSprint.endDate).toLocaleDateString()}`) : 'No active sprint — counting every task in the project'}</p>
              </div>
              <span className="badge bg-brand-600 text-white font-display">{data.sprintProgress}%</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full brand-gradient rounded-full transition-all duration-700"
                style={{ width: `${data.sprintProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-2">
              <span>{data.sprintDone} done</span>
              <span>{data.sprintTotal} total</span>
            </div>
          </div>

          {/* Work progress from accepted AI estimates */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-ink">Average Task Progress</h3>
                <p className="text-xs text-slate-400">From evening check-ins whose AI estimates were accepted or adjusted (Done tasks count as 100%)</p>
              </div>
              <span className="badge bg-mint-500 text-white font-display">{data.avgTaskProgress}%</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5">
              <div className="h-full bg-mint-400 rounded-full transition-all duration-700" style={{ width: `${data.avgTaskProgress}%` }} />
            </div>
          </div>

          {/* Recent Updates */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-8 rounded-full bg-sun-100 flex items-center justify-center"><MessageSquare className="w-4 h-4 text-sun-700" /></span>
              <h3 className="font-bold text-ink">Recent Daily Updates</h3>
            </div>
            {data.recentUpdates && data.recentUpdates.length > 0 ? (
              <div className="space-y-3">
                {data.recentUpdates.map(u => (
                  <div key={u._id} className="flex items-start gap-3 p-3 rounded-2xl bg-canvas hover:bg-brand-50 transition-colors">
                    <Avatar name={u.teamMember?.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-700">{u.teamMember?.name || 'Unknown'}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(u.createdAt)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{u.today}</p>
                      {u.blockers && (
                        <span className="inline-block mt-1 text-xs text-bubble-700 bg-bubble-100 px-2.5 py-0.5 rounded-full font-medium">⚠ {u.blockers.slice(0, 60)}{u.blockers.length > 60 ? '…' : ''}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">No daily updates yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
