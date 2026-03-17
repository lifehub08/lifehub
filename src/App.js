import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "lifehub_v2";
const defaultData = {
  isPremium: false,
  trialUsed: false,
  user: { name: "Omar", streak: 0, lastSeen: "", xp: 0, level: 1 },
  water: { today: 0, goal: 8, history: [] },
  sleep: [],
  meds: [],
  journal: [],
  healthScore: 72,
  aiMessages: [],
  aiQuestionsToday: 0,
  aiQuestionsDate: "",
  badges: [],
  settings: { waterReminder: true, medReminder: true, language: "fr" },
};

function load() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? { ...defaultData, ...JSON.parse(r) } : defaultData; }
  catch { return defaultData; }
}
function save(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

const TABS = [
  { id: "home", icon: "⚡", label: "Accueil" },
  { id: "water", icon: "💧", label: "Eau" },
  { id: "sleep", icon: "🌙", label: "Sommeil" },
  { id: "meds", icon: "💊", label: "Médocs" },
  { id: "journal", icon: "📝", label: "Journal" },
  { id: "ai", icon: "🧠", label: "Coach IA" },
];

const BADGES_DEF = [
  { id: "first_water", icon: "💧", name: "Premier Verre", desc: "Boire ton premier verre", xp: 10 },
  { id: "hydrated", icon: "🌊", name: "Bien Hydraté", desc: "Atteindre l'objectif eau 3 jours", xp: 50 },
  { id: "sleeper", icon: "😴", name: "Bon Dormeur", desc: "7h+ de sommeil 5 fois", xp: 75 },
  { id: "streak7", icon: "🔥", name: "Semaine de Feu", desc: "7 jours consécutifs", xp: 100 },
  { id: "med_master", icon: "💊", name: "Maître Médicament", desc: "Prendre tous tes médocs 7 jours", xp: 80 },
];

const LEVELS = [
  { level: 1, name: "Débutant", min: 0 },
  { level: 2, name: "Actif", min: 100 },
  { level: 3, name: "Sain", min: 300 },
  { level: 4, name: "Athlète", min: 600 },
  { level: 5, name: "Expert Santé", min: 1000 },
];

const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const getLevelInfo = (xp) => {
  const cur = [...LEVELS].reverse().find(l => xp >= l.min) || LEVELS[0];
  const next = LEVELS.find(l => l.min > xp);
  const pct = next ? ((xp - cur.min) / (next.min - cur.min)) * 100 : 100;
  return { ...cur, next, pct };
};

const S = {
  card: { background: "rgba(15,23,42,0.9)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: 20, padding: "18px 16px", backdropFilter: "blur(12px)" },
  btn: (color = "#6366f1", bg = null) => ({
    padding: "13px 20px", borderRadius: 14, border: "none",
    background: bg || `linear-gradient(135deg, ${color}, ${color}cc)`,
    color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
    boxShadow: `0 4px 20px ${color}44`, transition: "all 0.25s",
    fontFamily: "inherit",
  }),
  input: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #1e293b", background: "#0a0f1e", color: "#e2e8f0", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" },
  label: { fontSize: 11, color: "#64748b", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1.5 },
  tag: (color) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: `${color}22`, color, fontSize: 11, fontWeight: 700, border: `1px solid ${color}44` }),
};
export default function LifeHub() {
  const [data, setData] = useState(load);
  const [tab, setTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const chatRef = useRef(null);

  const update = useCallback((key, val) => {
    setData(prev => {
      const next = { ...prev, [key]: typeof val === "function" ? val(prev[key]) : val };
      save(next);
      return next;
    });
  }, []);

  const showToast = (msg, color = "#6366f1") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 3000);
  };

  const grantBadge = (id) => {
    if (data.badges.includes(id)) return;
    const badge = BADGES_DEF.find(b => b.id === id);
    if (!badge) return;
    update("badges", [...data.badges, id]);
    update("user", u => ({ ...u, xp: u.xp + badge.xp }));
    showToast(`🏆 Badge débloqué : ${badge.name} (+${badge.xp} XP)`, "#f59e0b");
  };

  useEffect(() => {
    const today = todayStr();
    if (data.user.lastSeen !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];
      const newStreak = data.user.lastSeen === yStr ? data.user.streak + 1 : 1;
      update("user", u => ({ ...u, lastSeen: today, streak: newStreak }));
      if (newStreak === 7) grantBadge("streak7");
    }
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [data.aiMessages]);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Bonne nuit" : hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const levelInfo = getLevelInfo(data.user.xp);

  const sendAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const today = todayStr();
    const questionsToday = data.aiQuestionsDate === today ? data.aiQuestionsToday : 0;
    if (!data.isPremium && questionsToday >= 3) { setModal("premium"); return; }
    const userMsg = { role: "user", content: aiInput };
    const newMsgs = [...data.aiMessages, userMsg];
    update("aiMessages", newMsgs);
    update("aiQuestionsToday", questionsToday + 1);
    update("aiQuestionsDate", today);
    setAiInput("");
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Tu es Coach Santé IA de LifeHub. Données: Eau: ${data.water.today}/${data.water.goal} verres. Sommeil: ${data.sleep.length ? data.sleep[data.sleep.length-1].hours+"h" : "non enregistré"}. Streak: ${data.user.streak} jours. Réponds en français, 2-4 phrases max, bienveillant et pratique.`,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();
      const reply = json.content?.[0]?.text || "Je suis là pour t'aider ! 💚";
      update("aiMessages", [...newMsgs, { role: "assistant", content: reply }]);
    } catch {
      update("aiMessages", [...newMsgs, { role: "assistant", content: "Désolé, une erreur s'est produite 🙏" }]);
    }
    setAiLoading(false);
  };

  const calcHealthScore = () => {
    let score = 40;
    score += Math.min((data.water.today / data.water.goal) * 20, 20);
    const lastSleep = data.sleep[data.sleep.length - 1];
    if (lastSleep) score += lastSleep.hours >= 7 ? 20 : lastSleep.hours >= 5 ? 10 : 0;
    if (data.meds.length > 0) score += (data.meds.filter(m => m.taken).length / data.meds.length) * 15;
    else score += 10;
    if (data.user.streak >= 3) score += 5;
    return Math.round(Math.min(score, 100));
  };

  const HomeTab = () => {
    const score = calcHealthScore();
    const scoreColor = score >= 80 ? "#34d399" : score >= 60 ? "#f59e0b" : "#f87171";
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (score / 100) * circumference;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...S.card, background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))", borderColor: "rgba(99,102,241,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: "#818cf8", marginBottom: 4, fontWeight: 600 }}>{greeting} 👋</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#f1f5f9" }}>{data.user.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>🔥 {data.user.streak} jours · {levelInfo.name}</div>
            </div>
            <svg width="80" height="80" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={scoreColor} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 60 60)" />
              <text x="60" y="56" textAnchor="middle" fill="white" fontSize="20" fontWeight="900" fontFamily="sans-serif">{score}</text>
              <text x="60" y="72" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="sans-serif">/ 100</text>
            </svg>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 5 }}>
              <span>⚡ {data.user.xp} XP</span>
              <span>{levelInfo.next ? `${levelInfo.next.min} XP → ${levelInfo.next.name}` : "Niveau Max!"}</span>
            </div>
            <div style={{ height: 5, background: "#1e293b", borderRadius: 999 }}>
              <div style={{ height: "100%", width: `${levelInfo.pct}%`, background: "linear-gradient(90deg, #6366f1, #818cf8)", borderRadius: 999 }} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "💧", label: "Eau", val: `${data.water.today}/${data.water.goal}`, unit: "verres", color: "#22d3ee", pct: data.water.today / data.water.goal * 100 },
            { icon: "🌙", label: "Sommeil", val: data.sleep.length ? data.sleep[data.sleep.length-1].hours : "—", unit: "heures", color: "#818cf8", pct: data.sleep.length ? (data.sleep[data.sleep.length-1].hours / 10) * 100 : 0 },
            { icon: "💊", label: "Médicaments", val: `${data.meds.filter(m=>m.taken).length}/${data.meds.length}`, unit: "pris", color: "#f472b6", pct: data.meds.length ? data.meds.filter(m=>m.taken).length / data.meds.length * 100 : 0 },
            { icon: "🏆", label: "Badges", val: data.badges.length, unit: `/ ${BADGES_DEF.length}`, color: "#f59e0b", pct: data.badges.length / BADGES_DEF.length * 100 },
          ].map((stat, i) => (
            <div key={i} style={S.card}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.val}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>{stat.unit}</div>
              <div style={{ height: 3, background: "#1e293b", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${Math.min(stat.pct, 100)}%`, background: stat.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>

        {!data.isPremium && (
          <div onClick={() => setModal("premium")} style={{ ...S.card, cursor: "pointer", background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.1))", borderColor: "rgba(245,158,11,0.4)", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 32 }}>👑</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: "#fbbf24", fontSize: 14, marginBottom: 2 }}>Passe à Premium</div>
              <div style={{ fontSize: 12, color: "#92400e" }}>Coach IA illimité · Analytics · Export PDF</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>2,99€ →</div>
          </div>
        )}

        <div style={S.card}>
          <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Tes Badges</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {BADGES_DEF.map(b => (
              <div key={b.id} style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: data.badges.includes(b.id) ? "rgba(99,102,241,0.2)" : "#0a0f1e", border: `2px solid ${data.badges.includes(b.id) ? "#6366f1" : "#1e293b"}`, filter: data.badges.includes(b.id) ? "none" : "grayscale(1) opacity(0.3)" }}>
                {b.icon}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const WaterTab = () => {
    const pct = Math.min((data.water.today / data.water.goal) * 100, 100);
    const color = pct < 40 ? "#f97316" : pct < 75 ? "#facc15" : "#22d3ee";
    const waveY = 160 - (pct / 100) * 148 + 8;
    const addWater = () => {
      update("water", w => ({ ...w, today: w.today + 1 }));
      if (data.water.today === 0) grantBadge("first_water");
      if (data.water.today + 1 >= data.water.goal) { showToast("🎉 Objectif eau atteint ! +5 XP", "#22d3ee"); update("user", u => ({ ...u, xp: u.xp + 5 })); }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Hydratation du jour</div>
          <div style={{ fontSize: 42, fontWeight: 900, color }}>{data.water.today}<span style={{ fontSize: 20, color: "#475569" }}>/{data.water.goal}</span></div>
        </div>
        <svg viewBox="0 0 160 160" width={200} height={200}>
          <defs>
            <clipPath id="cc"><circle cx="80" cy="80" r="70" /></clipPath>
            <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={color} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r="70" fill="#080d1a" />
          <g clipPath="url(#cc)">
            <rect x="0" y={waveY} width="160" height="160" fill="url(#wg)" />
          </g>
          <circle cx="80" cy="80" r="70" fill="none" stroke={color} strokeWidth="2.5" opacity="0.5" />
          <text x="80" y="74" textAnchor="middle" fill="white" fontSize="28" fontWeight="900" fontFamily="sans-serif">{Math.round(pct)}%</text>
          <text x="80" y="92" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="sans-serif">hydraté</text>
        </svg>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button onClick={() => update("water", w => ({ ...w, today: Math.max(0, w.today - 1) }))} style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid #334155", background: "#0a0f1e", color: "#94a3b8", fontSize: 24, cursor: "pointer" }}>−</button>
          <button onClick={addWater} style={{ width: 64, height: 64, borderRadius: "50%", border: "none", background: color, color: "#0a0f1e", fontSize: 28, fontWeight: 900, cursor: "pointer" }}>+</button>
          <button onClick={() => update("water", w => ({ ...w, today: 0 }))} style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid #334155", background: "#0a0f1e", color: "#94a3b8", fontSize: 16, cursor: "pointer" }}>↺</button>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center", maxWidth: 300 }}>
          {Array.from({ length: data.water.goal }).map((_, i) => (
            <div key={i} onClick={() => update("water", w => ({ ...w, today: i + 1 }))} style={{ width: 32, height: 32, borderRadius: 8, cursor: "pointer", background: i < data.water.today ? color : "#0f172a", border: `2px solid ${i < data.water.today ? color : "#1e293b"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {i < data.water.today ? "💧" : ""}
            </div>
          ))}
        </div>
        <button onClick={() => { setForm({ goal: data.water.goal }); setModal("water-goal"); }} style={{ ...S.btn("#22d3ee"), padding: "11px 24px" }}>
          ⚙ Objectif ({data.water.goal} verres)
        </button>
      </div>
    );
  };
const SleepTab = () => {
    const last7 = data.sleep.slice(-7);
    const avg = last7.length ? (last7.reduce((s, e) => s + e.hours, 0) / last7.length).toFixed(1) : 0;
    const maxH = Math.max(...last7.map(e => e.hours), 10);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Moyenne", val: avg + "h", color: "#818cf8" },
            { label: "Cette nuit", val: last7.length ? last7[last7.length-1].hours + "h" : "—", color: last7.length && last7[last7.length-1].hours >= 7 ? "#34d399" : "#f87171" },
            { label: "Streak", val: data.user.streak + "j", color: "#f59e0b" },
          ].map((s, i) => (
            <div key={i} style={{ ...S.card, textAlign: "center", padding: "14px 8px" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {last7.length > 0 && (
          <div style={S.card}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>7 derniers jours</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
              {last7.map((e, i) => {
                const barH = (Math.min(e.hours, maxH) / maxH) * 88;
                const c = e.hours >= 7 ? "#34d399" : e.hours >= 5 ? "#facc15" : "#f87171";
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 9, color: "#64748b" }}>{e.hours}h</div>
                    <div style={{ width: "100%", height: barH, background: c, borderRadius: "4px 4px 0 0" }} />
                    <div style={{ fontSize: 9, color: "#475569" }}>{new Date(e.date).toLocaleDateString("fr-FR", { weekday: "narrow" })}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={() => { setForm({ date: todayStr(), hours: 7, quality: "bon" }); setModal("sleep"); }} style={{ ...S.btn("#818cf8"), width: "100%", textAlign: "center" }}>
          🌙 Enregistrer une nuit
        </button>
      </div>
    );
  };

  const MedsTab = () => {
    const taken = data.meds.filter(m => m.taken).length;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.meds.length > 0 && (
          <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: taken === data.meds.length ? "#34d399" : "#f472b6" }}>{taken}/{data.meds.length}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 5 }}>médicaments pris</div>
              <div style={{ height: 5, background: "#1e293b", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${data.meds.length ? (taken/data.meds.length)*100 : 0}%`, background: "#f472b6", borderRadius: 999 }} />
              </div>
            </div>
          </div>
        )}
        {data.meds.length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: "40px 0" }}><div style={{ fontSize: 48 }}>💊</div><div>Aucun médicament enregistré</div></div>}
        {data.meds.map((med, i) => (
          <div key={i} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: med.taken ? "#34d399" : "#475569", boxShadow: med.taken ? "0 0 8px #34d399" : "none" }} />
              <div>
                <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 14 }}>{med.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{med.dose} · {med.frequency}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { update("meds", m => m.map((x, j) => j === i ? { ...x, taken: !x.taken } : x)); if (!med.taken) { showToast("💊 Pris ! +2 XP", "#f472b6"); update("user", u => ({ ...u, xp: u.xp + 2 })); } }} style={{ padding: "7px 12px", borderRadius: 10, border: "none", background: med.taken ? "rgba(52,211,153,0.15)" : "rgba(244,114,182,0.15)", color: med.taken ? "#34d399" : "#f472b6", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {med.taken ? "✓ Pris" : "Prendre"}
              </button>
              <button onClick={() => update("meds", m => m.filter((_, j) => j !== i))} style={{ padding: "7px 10px", borderRadius: 10, border: "none", background: "#1e293b", color: "#64748b", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={() => { setForm({ name: "", dose: "", frequency: "1x/jour", category: "Général" }); setModal("med"); }} style={{ ...S.btn("#f472b6"), width: "100%", textAlign: "center" }}>
          + Ajouter un médicament
        </button>
      </div>
    );
  };

  const JournalTab = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.journal.length === 0 && <div style={{ textAlign: "center", color: "#475569", padding: "40px 0" }}><div style={{ fontSize: 48 }}>📝</div><div>Ton journal est vide</div></div>}
      {[...data.journal].reverse().map((entry, i) => (
        <div key={i} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#475569" }}>{fmtDate(entry.date)}</span>
            <span style={{ fontSize: 22 }}>{["😔","😕","😐","🙂","😄"][entry.mood - 1]}</span>
          </div>
          <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.7 }}>{entry.note}</div>
          {entry.tags && entry.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {entry.tags.map(t => <span key={t} style={S.tag("#6366f1")}>{t}</span>)}
            </div>
          )}
        </div>
      ))}
      <button onClick={() => { setForm({ date: todayStr(), mood: 4, note: "", tags: [] }); setModal("journal"); }} style={{ ...S.btn("#f59e0b"), width: "100%", textAlign: "center" }}>
        + Nouvelle entrée
      </button>
    </div>
  );

  const AITab = () => {
    const today = todayStr();
    const questionsToday = data.aiQuestionsDate === today ? data.aiQuestionsToday : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", gap: 12 }}>
        <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>Coach Santé IA</div>
              <div style={{ fontSize: 11, color: "#34d399" }}>● En ligne</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: data.isPremium ? "#f59e0b" : "#64748b" }}>{data.isPremium ? "👑 Premium" : `${Math.max(0, 3 - questionsToday)} questions restantes`}</div>
        </div>
        <div ref={chatRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {data.aiMessages.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 16px" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🧠</div>
              <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 16 }}>Bonjour ! Je suis ton Coach Santé IA.</div>
              {["Comment améliorer mon sommeil ?", "Est-ce que je bois assez d'eau ?", "Conseils pour réduire le stress"].map(q => (
                <button key={q} onClick={() => setAiInput(q)} style={{ display: "block", width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid #1e293b", background: "#0a0f1e", color: "#94a3b8", fontSize: 12, cursor: "pointer", textAlign: "left", marginBottom: 8 }}>
                  💬 {q}
                </button>
              ))}
            </div>
          )}
          {data.aiMessages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%", padding: "11px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "linear-gradient(135deg, #6366f1, #818cf8)" : "rgba(15,23,42,0.95)", border: msg.role === "assistant" ? "1px solid #1e293b" : "none", fontSize: 13, color: "#e2e8f0", lineHeight: 1.6 }}>
                {msg.content}
              </div>
            </div>
          ))}
          {aiLoading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "11px 16px", borderRadius: "16px 16px 16px 4px", background: "rgba(15,23,42,0.95)", border: "1px solid #1e293b" }}>
                <span style={{ color: "#6366f1" }}>●</span><span style={{ color: "#818cf8", marginLeft: 3 }}>●</span><span style={{ color: "#a5b4fc", marginLeft: 3 }}>●</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendAI()} placeholder="Pose une question sur ta santé..." style={{ ...S.input, flex: 1 }} />
          <button onClick={sendAI} disabled={aiLoading} style={{ ...S.btn(), padding: "12px 16px" }}>→</button>
        </div>
        {!data.isPremium && questionsToday >= 3 && (
          <button onClick={() => setModal("premium")} style={{ ...S.btn("#f59e0b"), width: "100%", textAlign: "center" }}>👑 Débloquer Coach IA illimité</button>
        )}
      </div>
    );
  };

  const Modal = () => {
    if (!modal) return null;
    const close = () => { setModal(null); setForm({}); };
    const TAGS_LIST = ["#stress", "#sport", "#fatigue", "#douleur", "#joie", "#repos"];
    const saves = {
      "water-goal": () => { update("water", w => ({ ...w, goal: parseInt(form.goal) || 8 })); close(); },
      "sleep": () => { update("sleep", s => [...s, { date: form.date, hours: parseFloat(form.hours) || 7 }]); showToast("🌙 Sommeil enregistré ! +5 XP", "#818cf8"); update("user", u => ({ ...u, xp: u.xp + 5 })); close(); },
      "med": () => { if (!form.name) return; update("meds", m => [...m, { ...form, taken: false }]); showToast("💊 Médicament ajouté !", "#f472b6"); close(); },
      "journal": () => { if (!form.note) return; update("journal", j => [...j, form]); showToast("📝 Journal enregistré ! +3 XP", "#f59e0b"); update("user", u => ({ ...u, xp: u.xp + 3 })); close(); },
    };
    return (
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#0d1524", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 16, border: "1px solid #1e293b" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "#334155", margin: "0 auto" }} />
          {modal === "premium" && (
            <>
              <div style={{ textAlign: "center" }}><div style={{ fontSize: 48 }}>👑</div><div style={{ fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>LifeHub Premium</div></div>
              {[["🧠","Coach IA illimité"],["📊","Analytics avancées"],["🔔","Notifications"],["🏆","Gamification complète"],["☁️","Sync cloud"]].map(([icon, title]) => (
                <div key={title} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "rgba(245,158,11,0.08)", borderRadius: 12 }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{title}</div>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => { update("isPremium", true); showToast("🎉 Bienvenue Premium !", "#f59e0b"); close(); }} style={{ ...S.btn("#f59e0b"), textAlign: "center", padding: "14px 8px" }}>
                  <div style={{ fontSize: 16 }}>2,99€/mois</div>
                </button>
                <button onClick={() => { update("isPremium", true); showToast("🎉 Bienvenue Premium !", "#f59e0b"); close(); }} style={{ ...S.btn("#6366f1"), textAlign: "center", padding: "14px 8px" }}>
                  <div style={{ fontSize: 16 }}>19,99€/an</div>
                  <div style={{ fontSize: 10 }}>-44%</div>
                </button>
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: "#334155" }}>💳 Stripe · PayPal · Orange Money · Wave</div>
            </>
          )}
          {modal === "water-goal" && <>
            <h3 style={{ color: "#e2e8f0", margin: 0 }}>🎯 Objectif hydratation</h3>
            <div><label style={S.label}>Verres par jour</label><input type="number" style={S.input} value={form.goal || ""} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} /></div>
            <button onClick={saves["water-goal"]} style={{ ...S.btn("#22d3ee"), textAlign: "center" }}>Enregistrer</button>
          </>}
          {modal === "sleep" && <>
            <h3 style={{ color: "#e2e8f0", margin: 0 }}>🌙 Enregistrer une nuit</h3>
            <div><label style={S.label}>Date</label><input type="date" style={S.input} value={form.date || ""} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label style={S.label}>Heures dormies</label><input type="number" step="0.5" style={S.input} value={form.hours || ""} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} /></div>
            <button onClick={saves["sleep"]} style={{ ...S.btn("#818cf8"), textAlign: "center" }}>Enregistrer</button>
          </>}
          {modal === "med" && <>
            <h3 style={{ color: "#e2e8f0", margin: 0 }}>💊 Ajouter un médicament</h3>
            <div><label style={S.label}>Nom</label><input style={S.input} value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={S.label}>Dosage</label><input style={S.input} placeholder="ex: 500mg" value={form.dose || ""} onChange={e => setForm(f => ({ ...f, dose: e.target.value }))} /></div>
            <div><label style={S.label}>Fréquence</label>
              <select style={S.input} value={form.frequency || "1x/jour"} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                {["1x/jour","2x/jour","3x/jour","Matin","Soir","Avant repas","Après repas"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <button onClick={saves["med"]} style={{ ...S.btn("#f472b6"), textAlign: "center" }}>Ajouter</button>
          </>}
          {modal === "journal" && <>
            <h3 style={{ color: "#e2e8f0", margin: 0 }}>📝 Journal du jour</h3>
            <div>
              <label style={S.label}>Comment tu te sens ?</label>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {[1,2,3,4,5].map(m => (
                  <button key={m} onClick={() => setForm(f => ({ ...f, mood: m }))} style={{ fontSize: 28, background: "none", border: `2px solid ${form.mood === m ? "#f59e0b" : "transparent"}`, borderRadius: 12, padding: "4px 6px", cursor: "pointer" }}>
                    {["😔","😕","😐","🙂","😄"][m - 1]}
                  </button>
                ))}
              </div>
            </div>
            <div><label style={S.label}>Ta note</label><textarea style={{ ...S.input, minHeight: 90, resize: "none" }} value={form.note || ""} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
            <div>
              <label style={S.label}>Tags</label>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {TAGS_LIST.map(t => {
                  const sel = (form.tags || []).includes(t);
                  return <button key={t} onClick={() => setForm(f => ({ ...f, tags: sel ? (f.tags||[]).filter(x => x !== t) : [...(f.tags||[]), t] }))} style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${sel ? "#6366f1" : "#1e293b"}`, background: sel ? "rgba(99,102,241,0.2)" : "transparent", color: sel ? "#818cf8" : "#475569", fontSize: 12, cursor: "pointer" }}>{t}</button>;
                })}
              </div>
            </div>
            <button onClick={saves["journal"]} style={{ ...S.btn("#f59e0b"), textAlign: "center" }}>Enregistrer</button>
          </>}
        </div>
      </div>
    );
  };

  const tabContent = { home: <HomeTab />, water: <WaterTab />, sleep: <SleepTab />, meds: <MedsTab />, journal: <JournalTab />, ai: <AITab /> };

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at top, #0d1a2e 0%, #020817 60%)", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", minHeight: "100vh", position: "relative" }}>
        {toast && (
          <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 300, background: toast.color, color: "white", padding: "12px 20px", borderRadius: 999, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            {toast.msg}
          </div>
        )}
        <div style={{ padding: "20px 20px 10px", position: "sticky", top: 0, zIndex: 50, background: "rgba(2,8,23,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(99,102,241,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
              <span style={{ fontWeight: 900, fontSize: 18, background: "linear-gradient(135deg, #e2e8f0, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>LifeHub</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {data.isPremium && <span style={{ fontSize: 11, background: "rgba(245,158,11,0.2)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", padding: "3px 10px", borderRadius: 999, fontWeight: 700 }}>👑 PREMIUM</span>}
              <span style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>🔥 {data.user.streak}j</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: "16px 16px 90px", overflowY: "auto" }}>
          {tabContent[tab]}
        </div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "rgba(2,8,23,0.95)", backdropFilter: "blur(20
