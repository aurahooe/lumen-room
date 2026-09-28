import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

function prettyTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hours, setHours] = useState([]);
  const [wall, setWall] = useState([]);
  const [mine, setMine] = useState([]);
  const [draft, setDraft] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadPublic() {
    const { data: feats } = await supabase.from("lumen_hours").select("*").order("created_at", { ascending: false }).limit(8);
    setHours(feats || []);
    const { data: pubs } = await supabase.from("lumen_signals").select("id, body, created_at, user_id, is_public").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
    setWall(pubs || []);
  }

  useEffect(() => {
    loadPublic();
    const t = setInterval(loadPublic, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setMine([]);
      return;
    }
    (async () => {
      const { data } = await supabase.from("lumen_profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data);
      const { data: own } = await supabase.from("lumen_signals").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
      setMine(own || []);
    })();
  }, [session]);

  const featured = hours[0];

  async function submitAuth(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const h = (handle || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
          await supabase.from("lumen_profiles").insert({ id: data.user.id, handle: h || "guest", display_name: h || "wanderer" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      setAuthOpen(false);
    } catch (ex) {
      setErr(ex.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  async function postSignal() {
    if (!session?.user || !draft.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("lumen_signals").insert({ user_id: session.user.id, body: draft.trim().slice(0, 600), is_public: isPublic });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDraft("");
    await loadPublic();
    const { data: own } = await supabase.from("lumen_signals").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setMine(own || []);
  }

  async function togglePublic(item) {
    await supabase.from("lumen_signals").update({ is_public: !item.is_public }).eq("id", item.id);
    const { data: own } = await supabase.from("lumen_signals").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    setMine(own || []);
    loadPublic();
  }

  const wallCards = useMemo(() => wall.map((s, i) => (
    <article className="card" key={s.id} style={{ animationDelay: `${i * 40}ms` }}>
      <div className="meta">{prettyTime(s.created_at)}</div>
      <p>{s.body}</p>
    </article>
  )), [wall]);

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1 className="mark">Lumen <em>Room</em></h1>
          <p className="sub">A quiet wall that changes with the hour.</p>
        </div>
        <div className="authrow">
          {session ? (
            <>
              <span className="who">{profile?.handle ? `@${profile.handle}` : session.user.email}</span>
              <button onClick={() => supabase.auth.signOut()}>Leave</button>
            </>
          ) : (
            <button className="solid" onClick={() => setAuthOpen(true)}>Enter</button>
          )}
        </div>
      </header>
      {featured && (
        <section className="hour">
          <p className="kicker">This hour · {featured.hour_key}</p>
          <h2>{featured.title}</h2>
          <p>{featured.body}</p>
        </section>
      )}
      <div className="grid">
        <section className="panel">
          <h3>Public wall</h3>
          <div className="list">{wallCards.length ? wallCards : <p className="who">Nothing public yet. Be first.</p>}</div>
        </section>
        <section className="panel">
          <h3>Your desk</h3>
          {session ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600} placeholder="Leave a signal. It stays unless you mark it public." />
              <label className="tog"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Show this on the public wall</label>
              <button className="solid" disabled={busy || !draft.trim()} onClick={postSignal}>Save signal</button>
              <div className="list" style={{ marginTop: 18 }}>
                {mine.map((s) => (
                  <article className={`card ${s.is_public ? "" : "priv"}`} key={s.id}>
                    <div className="meta">{s.is_public ? "public" : "private"} · {prettyTime(s.created_at)}</div>
                    <p>{s.body}</p>
                    <button style={{ marginTop: 8 }} onClick={() => togglePublic(s)}>{s.is_public ? "Make private" : "Make public"}</button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="who">Enter to keep a private desk and pin signals to the wall.</p>
          )}
        </section>
      </div>
      {hours.length > 1 && (
        <section className="panel" style={{ marginTop: 22 }}>
          <h3>Earlier hours</h3>
          <div className="list">
            {hours.slice(1).map((h) => (
              <article className="card" key={h.id}>
                <div className="meta">{h.hour_key}</div>
                <p><strong>{h.title}.</strong> {h.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {authOpen && (
        <div className="modal" onClick={() => setAuthOpen(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submitAuth}>
            <h3>{mode === "signup" ? "Take a seat" : "Come back in"}</h3>
            <input type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div style={{ height: 8 }} />
            <input type="password" required minLength={6} placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "signup" && (<><div style={{ height: 8 }} /><input placeholder="handle (optional)" value={handle} onChange={(e) => setHandle(e.target.value)} /></>)}
            <p className="err">{err}</p>
            <div className="row">
              <button className="solid" disabled={busy}>{busy ? "…" : mode === "signup" ? "Create room key" : "Enter"}</button>
              <button type="button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); }}>{mode === "signup" ? "I already have a key" : "I need a key"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
