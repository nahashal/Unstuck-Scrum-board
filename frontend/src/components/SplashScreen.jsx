import { useEffect, useState } from 'react';

const SHOW_MS = 1800;
const FADE_MS = 500;

// Brand splash shown each time the app opens; click anywhere to skip it.
export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t1 = setTimeout(() => setLeaving(true), reduceMotion ? 800 : SHOW_MS);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t2 = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(t2);
  }, [leaving, onDone]);

  return (
    <div
      role="presentation"
      onClick={() => setLeaving(true)}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#f1f0ec] px-6 cursor-pointer
        transition-opacity duration-500 ${leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <img
        src="/unstuck-splash.webp"
        alt="Unstuck — From blockers to breakthroughs"
        className="w-full max-w-4xl h-auto select-none animate-splash-in"
        style={{
          // Feather the edges so the image melts into the background
          WebkitMaskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, #000 70%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, #000 70%, transparent 100%)',
        }}
        draggable={false}
      />
    </div>
  );
}
