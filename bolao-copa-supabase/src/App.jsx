import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Trophy, Plus, Lock, Unlock, Medal, Calendar, Settings2, Trash2, Check, Users, ChevronRight, Loader2, Eye, Repeat } from "lucide-react";
import { supabase } from "./supabaseClient";

const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || "network2026";
const STORAGE_NAME_KEY = "bolao-copa-2026:name";
const STORAGE_NAMES_KEY = "bolao-copa-2026:knownNames";

const PHASES = [
  "Fase de Grupos",
  "16-avos de Final",
  "Oitavas de Final",
  "Quartas de Final",
  "Semifinal",
  "Disputa de 3º Lugar",
  "Final",
];

const PHASE_COLOR = {
  "Fase de Grupos": "#3FA796",
  "16-avos de Final": "#5B7FDE",
  "Oitavas de Final": "#8C6FE0",
  "Quartas de Final": "#D88A3F",
  "Semifinal": "#E2483D",
  "Disputa de 3º Lugar": "#8C90B8",
  "Final": "#F5B642",
};

function calcPoints(pred, res) {
  if (!pred || !res) return 0;
  if (pred.s1 === res.s1 && pred.s2 === res.s2) return 10;
  const pd = Math.sign(pred.s1 - pred.s2);
  const rd = Math.sign(res.s1 - res.s2);
  if (pd === rd) return 5;
  return 0;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [matches, setMatches] = useState([]);
  const [results, setResults] = useState({});
  const [participants, setParticipants] = useState([]);
  const [allPredictions, setAllPredictions] = useState({}); // participant -> {matchId: {s1,s2}}
  const [tab, setTab] = useState("jogos");
  const [predDrafts, setPredDrafts] = useState({});
  const [resultDrafts, setResultDrafts] = useState({});
  const [saveStatus, setSaveStatus] = useState({});
  const [adminMode, setAdminMode] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [adminError, setAdminError] = useState("");
  const [newMatch, setNewMatch] = useState({ phase: "Oitavas de Final", team1: "", team2: "", date: "", time: "" });
  const [confirmReset, setConfirmReset] = useState(false);
  const [connError, setConnError] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);
  const [expandedMatches, setExpandedMatches] = useState({});
  const [knownNames, setKnownNames] = useState([]);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchInput, setSwitchInput] = useState("");

  const toggleExpanded = (id) => setExpandedMatches((e) => ({ ...e, [id]: !e[id] }));

  const persistKnownNames = (list) => {
    setKnownNames(list);
    localStorage.setItem(STORAGE_NAMES_KEY, JSON.stringify(list));
  };
  const rememberName = (n) => {
    setKnownNames((prev) => {
      if (prev.includes(n)) return prev;
      const next = [...prev, n];
      localStorage.setItem(STORAGE_NAMES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const myPredictions = allPredictions[name] || {};

  // ---------- Data loading ----------
  const refreshAll = useCallback(async () => {
    try {
      const [m, r, p, pr] = await Promise.all([
        supabase.from("matches").select("*"),
        supabase.from("results").select("*"),
        supabase.from("participants").select("name"),
        supabase.from("predictions").select("*"),
      ]);
      if (m.error || r.error || p.error || pr.error) {
        setConnError("Não foi possível conectar ao Supabase. Confira a URL e a chave anon no .env.");
        return;
      }
      setConnError("");
      setMatches(m.data || []);
      const resMap = {};
      (r.data || []).forEach((row) => (resMap[row.match_id] = { s1: row.s1, s2: row.s2 }));
      setResults(resMap);
      setParticipants((p.data || []).map((x) => x.name));
      const predMap = {};
      (pr.data || []).forEach((row) => {
        if (!predMap[row.participant]) predMap[row.participant] = {};
        predMap[row.participant][row.match_id] = { s1: row.s1, s2: row.s2 };
      });
      setAllPredictions(predMap);
    } catch (e) {
      setConnError("Erro de conexão com o Supabase.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const saved = localStorage.getItem(STORAGE_NAME_KEY);
      if (saved) setName(saved);
      try {
        const savedNames = JSON.parse(localStorage.getItem(STORAGE_NAMES_KEY) || "[]");
        setKnownNames(savedNames);
      } catch (e) {
        setKnownNames([]);
      }
      await refreshAll();
      setLoading(false);
    })();
  }, [refreshAll]);

  // ---------- Realtime ----------
  const debounceRef = useRef(null);
  useEffect(() => {
    const channel = supabase
      .channel("bolao-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "results" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, scheduleRefresh)
      .subscribe();

    function scheduleRefresh() {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refreshAll, 400);
    }

    return () => {
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [refreshAll]);

  // ---------- Profile ----------
  const confirmName = async () => {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem(STORAGE_NAME_KEY, n);
    setName(n);
    rememberName(n);
    await supabase.from("participants").upsert({ name: n });
    refreshAll();
  };

  const switchToName = async (n) => {
    n = n.trim();
    if (!n) return;
    localStorage.setItem(STORAGE_NAME_KEY, n);
    setName(n);
    rememberName(n);
    setSwitchOpen(false);
    setSwitchInput("");
    await supabase.from("participants").upsert({ name: n });
    refreshAll();
  };

  // ---------- Predictions ----------
  const draftFor = (id) => {
    if (predDrafts[id]) return predDrafts[id];
    const mp = myPredictions[id];
    return { s1: mp ? String(mp.s1) : "", s2: mp ? String(mp.s2) : "" };
  };
  const updateDraft = (id, side, val) => {
    val = val.replace(/[^0-9]/g, "").slice(0, 2);
    setPredDrafts((d) => ({ ...d, [id]: { ...draftFor(id), [side]: val } }));
  };
  const savePrediction = async (id) => {
    const d = draftFor(id);
    if (d.s1 === "" || d.s2 === "") return;
    setSaveStatus((s) => ({ ...s, [id]: "saving" }));
    const { error } = await supabase
      .from("predictions")
      .upsert({ participant: name, match_id: id, s1: Number(d.s1), s2: Number(d.s2) }, { onConflict: "participant,match_id" });
    setSaveStatus((s) => ({ ...s, [id]: error ? "error" : "saved" }));
    if (!error) {
      setAllPredictions((all) => ({
        ...all,
        [name]: { ...(all[name] || {}), [id]: { s1: Number(d.s1), s2: Number(d.s2) } },
      }));
    }
    setTimeout(() => setSaveStatus((s) => ({ ...s, [id]: null })), 1800);
  };

  // ---------- Leaderboard ----------
  const leaderboard = useMemo(() => {
    return participants
      .map((p) => {
        let pts = 0,
          exact = 0,
          correct = 0,
          played = 0;
        matches.forEach((m) => {
          const res = results[m.id];
          const pred = (allPredictions[p] || {})[m.id];
          if (res && pred) {
            played++;
            const pt = calcPoints(pred, res);
            pts += pt;
            if (pt === 10) exact++;
            else if (pt === 5) correct++;
          }
        });
        return { name: p, pts, exact, correct, played };
      })
      .sort((a, b) => b.pts - a.pts);
  }, [participants, matches, results, allPredictions]);

  // ---------- Admin ----------
  const tryAdminLogin = () => {
    if (adminPassInput === ADMIN_PASS) {
      setAdminMode(true);
      setAdminGateOpen(false);
      setAdminPassInput("");
      setAdminError("");
    } else {
      setAdminError("Código incorreto.");
    }
  };

  const addMatch = async () => {
    if (!newMatch.team1.trim() || !newMatch.team2.trim()) return;
    await supabase.from("matches").insert({
      phase: newMatch.phase,
      team1: newMatch.team1.trim(),
      team2: newMatch.team2.trim(),
      date: newMatch.date || null,
      time: newMatch.time || null,
    });
    setNewMatch({ phase: newMatch.phase, team1: "", team2: "", date: "", time: "" });
    refreshAll();
  };

  const deleteMatch = async (id) => {
    await supabase.from("matches").delete().eq("id", id);
    refreshAll();
  };

  const resultDraftFor = (id) => {
    if (resultDrafts[id]) return resultDrafts[id];
    const r = results[id];
    return { s1: r ? String(r.s1) : "", s2: r ? String(r.s2) : "" };
  };
  const updateResultDraft = (id, side, val) => {
    val = val.replace(/[^0-9]/g, "").slice(0, 2);
    setResultDrafts((d) => ({ ...d, [id]: { ...resultDraftFor(id), [side]: val } }));
  };
  const saveResult = async (id) => {
    const d = resultDraftFor(id);
    if (d.s1 === "" || d.s2 === "") return;
    await supabase.from("results").upsert({ match_id: id, s1: Number(d.s1), s2: Number(d.s2) }, { onConflict: "match_id" });
    refreshAll();
  };
  const clearResult = async (id) => {
    await supabase.from("results").delete().eq("match_id", id);
    refreshAll();
  };

  const isKickoffPassed = (m) => {
    if (!m.date) return false;
    const kickoff = new Date(`${m.date}T${m.time || "00:00"}`);
    if (isNaN(kickoff.getTime())) return false;
    return nowTick >= kickoff.getTime();
  };

  const lockInfo = (m) => {
    if (results[m.id]) return { locked: true, reason: "result" };
    if (m.locked) return { locked: true, reason: "manual" };
    if (isKickoffPassed(m)) return { locked: true, reason: "kickoff" };
    return { locked: false, reason: null };
  };

  const toggleManualLock = async (m) => {
    await supabase.from("matches").update({ locked: !m.locked }).eq("id", m.id);
    refreshAll();
  };

  const resetAll = async () => {
    await supabase.from("predictions").delete().neq("participant", "__none__");
    await supabase.from("results").delete().neq("match_id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("participants").delete().neq("name", "__none__");
    setConfirmReset(false);
    refreshAll();
  };

  const groupedMatches = useMemo(() => {
    const g = {};
    PHASES.forEach((p) => (g[p] = []));
    matches.forEach((m) => {
      if (!g[m.phase]) g[m.phase] = [];
      g[m.phase].push(m);
    });
    return g;
  }, [matches]);

  if (loading) {
    return (
      <Shell>
        <Center>
          <Loader2 className="spin" size={22} />
          <span style={{ fontFamily: "var(--font-body)", color: "#8C90B8" }}>Carregando bolão…</span>
        </Center>
      </Shell>
    );
  }

  if (connError) {
    return (
      <Shell>
        <Center>
          <div style={{ color: "#E2483D", fontFamily: "var(--font-body)", textAlign: "center", maxWidth: 320 }}>{connError}</div>
        </Center>
      </Shell>
    );
  }

  if (!name) {
    return (
      <Shell>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 360, gap: 18, padding: "0 24px", textAlign: "center" }}>
          <Trophy size={40} color="#F5B642" />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: 0.5, color: "#F4F1EA" }}>BOLÃO NETWORK</div>
          <div style={{ fontFamily: "var(--font-body)", color: "#8C90B8", fontSize: 14, maxWidth: 320 }}>
            Digite seu nome para entrar no grupo e começar a dar seus palpites.
          </div>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmName()}
            placeholder="Seu nome"
            style={inputStyle({ width: 240, textAlign: "center" })}
          />
          <button onClick={confirmName} style={primaryBtn}>
            Entrar no bolão <ChevronRight size={16} />
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Trophy size={24} color="#F5B642" />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: 0.5, color: "#F4F1EA", lineHeight: 1 }}>
              BOLÃO NETWORK
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#8C90B8" }}>
              Jogando como <strong style={{ color: "#F5B642" }}>{name}</strong>
              {" · "}
              <span
                onClick={() => setSwitchOpen(true)}
                style={{ color: "#8C90B8", textDecoration: "underline", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}
              >
                <Repeat size={11} /> trocar de cartão
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => (adminMode ? setAdminMode(false) : setAdminGateOpen(true))}
          style={{
            background: adminMode ? "#F5B642" : "transparent",
            border: `1px solid ${adminMode ? "#F5B642" : "#3A3F6E"}`,
            color: adminMode ? "#0B0E2A" : "#8C90B8",
            borderRadius: 8,
            padding: "7px 11px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-body)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {adminMode ? <Unlock size={14} /> : <Lock size={14} />}
          {adminMode ? "Modo organizador" : "Organizador"}
        </button>
      </div>

      {adminGateOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "#F4F1EA", marginBottom: 10 }}>ÁREA DO ORGANIZADOR</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#8C90B8", marginBottom: 14 }}>
              Digite o código para adicionar jogos e lançar resultados.
            </div>
            <input
              type="password"
              value={adminPassInput}
              onChange={(e) => setAdminPassInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
              placeholder="Código"
              style={inputStyle({ width: "100%", marginBottom: 8 })}
            />
            {adminError && <div style={{ color: "#E2483D", fontSize: 12, fontFamily: "var(--font-body)", marginBottom: 8 }}>{adminError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setAdminGateOpen(false); setAdminError(""); setAdminPassInput(""); }} style={ghostBtn}>
                Cancelar
              </button>
              <button onClick={tryAdminLogin} style={primaryBtn}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}

      {switchOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "#F4F1EA", marginBottom: 10 }}>TROCAR DE CARTÃO</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#8C90B8", marginBottom: 14 }}>
              Cada cartão é um jogo independente no bolão, com pontuação separada.
            </div>

            {knownNames.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {knownNames.map((n) => (
                  <button
                    key={n}
                    onClick={() => switchToName(n)}
                    style={{
                      ...ghostBtn,
                      justifyContent: "space-between",
                      width: "100%",
                      borderColor: n === name ? "#F5B642" : "#3A3F6E",
                      color: n === name ? "#F5B642" : "#C7CAE8",
                    }}
                  >
                    {n} {n === name && "· ativo"}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#8C90B8", marginBottom: 6 }}>Criar novo cartão:</div>
            <input
              value={switchInput}
              onChange={(e) => setSwitchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && switchToName(switchInput)}
              placeholder="Ex: Alysson - Cartão 2"
              style={inputStyle({ width: "100%", marginBottom: 8 })}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setSwitchOpen(false); setSwitchInput(""); }} style={ghostBtn}>
                Cancelar
              </button>
              <button onClick={() => switchToName(switchInput)} style={primaryBtn}>
                <Plus size={14} /> Criar e usar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: "8px 22px 14px" }}>
        {[
          ["jogos", "Jogos & Palpites"],
          ["classificacao", "Classificação"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 13,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: tab === id ? "#F5B642" : "#14183F",
              color: tab === id ? "#0B0E2A" : "#C7CAE8",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 22px 28px" }}>
        {tab === "jogos" && (
          <>
            {adminMode && (
              <div style={{ ...cardStyle, marginBottom: 18, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Settings2 size={16} color="#F5B642" />
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "#F4F1EA", letterSpacing: 0.3 }}>
                    ADICIONAR PARTIDA
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <input placeholder="Time 1" value={newMatch.team1} onChange={(e) => setNewMatch({ ...newMatch, team1: e.target.value })} style={inputStyle({})} />
                  <input placeholder="Time 2" value={newMatch.team2} onChange={(e) => setNewMatch({ ...newMatch, team2: e.target.value })} style={inputStyle({})} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr", gap: 8, marginBottom: 10 }}>
                  <select value={newMatch.phase} onChange={(e) => setNewMatch({ ...newMatch, phase: e.target.value })} style={inputStyle({})}>
                    {PHASES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={newMatch.date} onChange={(e) => setNewMatch({ ...newMatch, date: e.target.value })} style={inputStyle({})} />
                  <input type="time" value={newMatch.time} onChange={(e) => setNewMatch({ ...newMatch, time: e.target.value })} style={inputStyle({})} />
                </div>
                <button onClick={addMatch} style={primaryBtn}>
                  <Plus size={15} /> Adicionar jogo
                </button>

                <div style={{ marginTop: 16, borderTop: "1px dashed #3A3F6E", paddingTop: 12 }}>
                  {!confirmReset ? (
                    <button onClick={() => setConfirmReset(true)} style={{ ...ghostBtn, color: "#E2483D", borderColor: "#5b2a2a" }}>
                      <Trash2 size={14} /> Limpar todos os dados do bolão
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#E2483D" }}>
                        Isso apaga jogos, palpites e resultados. Confirma?
                      </span>
                      <button onClick={resetAll} style={{ ...ghostBtn, color: "#E2483D", borderColor: "#5b2a2a" }}>
                        Sim, apagar
                      </button>
                      <button onClick={() => setConfirmReset(false)} style={ghostBtn}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {matches.length === 0 && (
              <div style={{ ...cardStyle, padding: 28, textAlign: "center", color: "#8C90B8", fontFamily: "var(--font-body)", fontSize: 14 }}>
                Nenhuma partida cadastrada ainda.
                {adminMode ? " Use o formulário acima para adicionar a primeira." : " Peça ao organizador para cadastrar os jogos."}
              </div>
            )}

            {PHASES.map((phase) =>
              groupedMatches[phase] && groupedMatches[phase].length > 0 ? (
                <div key={phase} style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PHASE_COLOR[phase] }} />
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, letterSpacing: 1, color: "#C7CAE8" }}>
                      {phase.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {groupedMatches[phase].map((m) => {
                      const res = results[m.id];
                      const pred = draftFor(m.id);
                      const lock = lockInfo(m);
                      const locked = lock.locked;
                      const pts = locked && res && myPredictions[m.id] ? calcPoints(myPredictions[m.id], res) : null;
                      const status = saveStatus[m.id];
                      const allPredsForMatch = participants
                        .map((p) => ({ name: p, pred: (allPredictions[p] || {})[m.id] }))
                        .filter((x) => x.pred);
                      const isExpanded = !!expandedMatches[m.id];
                      return (
                        <div key={m.id}>
                        <div style={ticketStyle}>
                          <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "#F4F1EA", letterSpacing: 0.3 }}>
                              {m.team1} <span style={{ color: "#5B5F94" }}>vs</span> {m.team2}
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#8C90B8", fontFamily: "var(--font-body)", fontSize: 12 }}>
                              {(m.date || m.time) && (
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <Calendar size={12} /> {m.date} {m.time}
                                </span>
                              )}
                              {res ? (
                                <span style={{ color: "#3FA796", fontWeight: 600 }}>
                                  Resultado: {res.s1} x {res.s2}
                                </span>
                              ) : lock.reason === "manual" ? (
                                <span style={{ color: "#D88A3F", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                  <Lock size={11} /> Palpites travados pelo organizador
                                </span>
                              ) : lock.reason === "kickoff" ? (
                                <span style={{ color: "#D88A3F", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                  <Lock size={11} /> Palpites travados (jogo já começou)
                                </span>
                              ) : (
                                <span>Aguardando jogo</span>
                              )}
                            </div>
                            {res && pts !== null && (
                              <div
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: pts === 10 ? "#F5B642" : pts === 5 ? "#3FA796" : "#E2483D",
                                }}
                              >
                                {pts === 10 ? "★ CRAVOU O PLACAR · +10" : pts === 5 ? "✓ ACERTOU O RESULTADO · +5" : "✕ NÃO PONTUOU"}
                              </div>
                            )}
                            {adminMode && (
                              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                                <input
                                  value={resultDraftFor(m.id).s1}
                                  onChange={(e) => updateResultDraft(m.id, "s1", e.target.value)}
                                  style={scoreInputSmall}
                                />
                                <span style={{ color: "#5B5F94" }}>x</span>
                                <input
                                  value={resultDraftFor(m.id).s2}
                                  onChange={(e) => updateResultDraft(m.id, "s2", e.target.value)}
                                  style={scoreInputSmall}
                                />
                                <button onClick={() => saveResult(m.id)} style={tinyBtn}>
                                  Lançar resultado
                                </button>
                                {res && (
                                  <button onClick={() => clearResult(m.id)} style={{ ...tinyBtn, color: "#E2483D" }}>
                                    Limpar
                                  </button>
                                )}
                                <button
                                  onClick={() => toggleManualLock(m)}
                                  style={{ ...tinyBtn, color: m.locked ? "#3FA796" : "#D88A3F" }}
                                >
                                  {m.locked ? <Unlock size={12} /> : <Lock size={12} />}
                                  {m.locked ? "Destravar palpites" : "Travar palpites agora"}
                                </button>
                                <button onClick={() => deleteMatch(m.id)} style={{ ...tinyBtn, marginLeft: "auto", color: "#E2483D" }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div style={perforation} />

                          <div style={{ width: 156, padding: "14px 14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                value={pred.s1}
                                disabled={locked}
                                onChange={(e) => updateDraft(m.id, "s1", e.target.value)}
                                style={scoreInput(locked)}
                              />
                              <span style={{ color: "#5B5F94", fontFamily: "var(--font-mono)" }}>x</span>
                              <input
                                value={pred.s2}
                                disabled={locked}
                                onChange={(e) => updateDraft(m.id, "s2", e.target.value)}
                                style={scoreInput(locked)}
                              />
                            </div>
                            {!locked && (
                              <button onClick={() => savePrediction(m.id)} style={tinyBtn}>
                                {status === "saving" ? "Salvando…" : status === "saved" ? <><Check size={12} /> Salvo</> : "Salvar palpite"}
                              </button>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => toggleExpanded(m.id)}
                          style={{
                            ...tinyBtn,
                            marginTop: 6,
                            justifyContent: "center",
                            width: "100%",
                            borderStyle: "dashed",
                          }}
                        >
                          <Eye size={12} />
                          {isExpanded ? "Esconder palpites" : `Ver palpites de todos (${allPredsForMatch.length})`}
                        </button>

                        {isExpanded && (
                          <div style={{ ...cardStyle, marginTop: 6, padding: "10px 14px" }}>
                            {allPredsForMatch.length === 0 ? (
                              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#8C90B8" }}>
                                Ninguém deu palpite nesse jogo ainda.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {allPredsForMatch.map(({ name: pname, pred: pp }) => (
                                  <div key={pname} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: pname === name ? "#F5B642" : "#C7CAE8" }}>
                                      {pname}
                                    </span>
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#F4F1EA" }}>
                                      {pp.s1} x {pp.s2}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null
            )}
          </>
        )}

        {tab === "classificacao" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Users size={16} color="#F5B642" />
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "#8C90B8" }}>
                Pontuação: <strong style={{ color: "#F5B642" }}>10 pts</strong> placar exato · <strong style={{ color: "#3FA796" }}>5 pts</strong> acertou o resultado · 0 pts errou
              </div>
            </div>
            {leaderboard.length === 0 ? (
              <div style={{ ...cardStyle, padding: 28, textAlign: "center", color: "#8C90B8", fontFamily: "var(--font-body)" }}>
                Ninguém entrou no bolão ainda.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {leaderboard.map((row, i) => (
                  <div
                    key={row.name}
                    style={{
                      ...cardStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 16px",
                      border: row.name === name ? "1px solid #F5B642" : "1px solid #23274F",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-display)",
                        fontSize: 14,
                        flexShrink: 0,
                        background: i === 0 ? "#F5B642" : i === 1 ? "#C7CAE8" : i === 2 ? "#D88A3F" : "#23274F",
                        color: i <= 2 ? "#0B0E2A" : "#8C90B8",
                      }}
                    >
                      {i < 3 ? <Medal size={15} /> : i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "#F4F1EA" }}>{row.name}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#8C90B8" }}>
                        {row.played} jogos avaliados · {row.exact} cravados · {row.correct} acertos de resultado
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "#F5B642" }}>{row.pts}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ background: "#0B0E2A", minHeight: "100vh", fontFamily: "var(--font-body)", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Work+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
        :root {
          --font-display: 'Anton', 'Arial Narrow', sans-serif;
          --font-body: 'Work Sans', sans-serif;
          --font-mono: 'JetBrains Mono', monospace;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #5B5F94; }
        select { -webkit-appearance: none; appearance: none; }
        body { margin: 0; }
        .bg-watermark-wrap {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(78vw, 640px);
          max-width: 92vw;
          pointer-events: none;
          user-select: none;
          z-index: 0;
        }
        @media (min-width: 900px) {
          .bg-watermark-wrap { width: min(46vw, 640px); }
        }
        .bg-glow {
          position: absolute;
          inset: -18%;
          background: radial-gradient(circle at center, rgba(244,241,234,0.09) 0%, rgba(244,241,234,0.04) 40%, rgba(244,241,234,0) 72%);
          filter: blur(6px);
        }
        .bg-watermark {
          position: relative;
          width: 100%;
          display: block;
          opacity: 0.92;
        }
      `}</style>
      <div className="bg-watermark-wrap">
        <div className="bg-glow" />
        <img src="/logo-network.png" alt="" className="bg-watermark" />
      </div>
      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 10 }}>{children}</div>;
}

const cardStyle = { background: "#14183F", border: "1px solid #23274F", borderRadius: 12 };

const ticketStyle = {
  display: "flex",
  background: "#14183F",
  border: "1px solid #23274F",
  borderRadius: 12,
  position: "relative",
  overflow: "hidden",
};

const perforation = {
  width: 0,
  borderLeft: "2px dashed #2A2F5C",
  margin: "10px 0",
};

function inputStyle(extra) {
  return {
    background: "#0B0E2A",
    border: "1px solid #2A2F5C",
    color: "#F4F1EA",
    borderRadius: 8,
    padding: "9px 11px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    outline: "none",
    ...extra,
  };
}

function scoreInput(disabled) {
  return {
    width: 38,
    height: 38,
    textAlign: "center",
    background: disabled ? "#1B1F49" : "#0B0E2A",
    border: `1px solid ${disabled ? "#23274F" : "#3A3F6E"}`,
    color: disabled ? "#5B5F94" : "#F4F1EA",
    borderRadius: 8,
    fontFamily: "var(--font-mono)",
    fontSize: 17,
    fontWeight: 700,
    outline: "none",
  };
}

const scoreInputSmall = {
  width: 30,
  height: 28,
  textAlign: "center",
  background: "#0B0E2A",
  border: "1px solid #3A3F6E",
  color: "#F4F1EA",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  outline: "none",
};

const primaryBtn = {
  background: "#F5B642",
  color: "#0B0E2A",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontFamily: "var(--font-body)",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  justifyContent: "center",
};

const ghostBtn = {
  background: "transparent",
  color: "#8C90B8",
  border: "1px solid #3A3F6E",
  borderRadius: 8,
  padding: "9px 14px",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const tinyBtn = {
  background: "transparent",
  color: "#C7CAE8",
  border: "1px solid #3A3F6E",
  borderRadius: 6,
  padding: "5px 9px",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(11,14,42,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
};

const modalStyle = {
  background: "#14183F",
  border: "1px solid #2A2F5C",
  borderRadius: 14,
  padding: 22,
  width: 300,
};
