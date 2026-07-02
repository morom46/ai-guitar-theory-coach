import React, { useEffect, useRef, useState } from "react";

/**
 * SPOTIFY RECENT — recently played tracks + automatic key lookup.
 * Fully client-side: PKCE login (no secret), tokens in localStorage, direct
 * calls to Spotify (which sends CORS). Spotify removed key data from its API
 * (Nov 2024), so keys come from a small key-proxy worker (see /worker) that
 * wraps GetSongBPM. With a proxy set, keys show automatically; without one, the
 * panel falls back to manual key-finder links.
 */

// A Spotify Client ID is a public identifier (not a secret) — safe in client code.
const CLIENT_ID = "d0df00eaf98b442c85099d732a3f1587";

const C = {
  ink: "#DCE6EC", muted: "#7C8A95", line: "#3A4853", sun: "#FF7A2E",
  sunDeep: "#E0601B", cyan: "#36C7E0", green: "#1DB954", red: "#E0533F", grid: "rgba(120,150,170,0.10)",
};

const SCOPE = "user-read-recently-played";
const AUTH = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const redirectUri = () => window.location.origin + window.location.pathname;

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = (s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
const randStr = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => ("0" + b.toString(16)).slice(-2)).join(""); };

const yt = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
const tunebat = (q) => "https://tunebat.com/Search?q=" + encodeURIComponent(q);

async function login() {
  const verifier = randStr(48);
  ls.set("sp.verifier", verifier);
  const challenge = b64url(await sha256(verifier));
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: "code", redirect_uri: redirectUri(),
    scope: SCOPE, code_challenge_method: "S256", code_challenge: challenge,
  });
  window.location.assign(AUTH + "?" + p.toString());
}

async function exchange(code) {
  const verifier = ls.get("sp.verifier");
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: redirectUri(),
    client_id: CLIENT_ID, code_verifier: verifier || "",
  });
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error("token exchange failed");
  return r.json();
}

async function refresh() {
  const rt = ls.get("sp.refresh");
  if (!rt) return null;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: CLIENT_ID });
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) return null;
  return r.json();
}

function storeToken(t) {
  ls.set("sp.token", t.access_token);
  if (t.refresh_token) ls.set("sp.refresh", t.refresh_token);
  ls.set("sp.exp", String(Date.now() + (t.expires_in || 3600) * 1000));
}

export default function SpotifyRecent({ onPickKey, actions } = {}) {
  const [proxy, setProxy] = useState(ls.get("key.proxy") || "");
  const [proxyInput, setProxyInput] = useState("");
  const [token, setToken] = useState(ls.get("sp.token") || "");
  const [tracks, setTracks] = useState([]);
  const [keyMap, setKeyMap] = useState({}); // id -> { status, key }
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const fetched = useRef(new Set());

  // handle the OAuth redirect (?code=...) once on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code) {
      setStatus("loading");
      exchange(code)
        .then((t) => { storeToken(t); setToken(t.access_token); })
        .catch((e) => { setErr(String(e.message || e)); setStatus("error"); })
        .finally(() => {
          url.searchParams.delete("code"); url.searchParams.delete("state");
          window.history.replaceState({}, "", url.pathname + url.hash);
        });
    }
  }, []);

  const fetchRecent = async () => {
    setStatus("loading"); setErr("");
    let tok = ls.get("sp.token");
    const exp = Number(ls.get("sp.exp") || 0);
    if (!tok || Date.now() > exp - 30000) {
      const t = await refresh();
      if (t) { storeToken(t); tok = t.access_token; setToken(tok); }
    }
    if (!tok) { setStatus("idle"); return; }
    try {
      const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=30", { headers: { Authorization: "Bearer " + tok } });
      if (r.status === 401) { ls.del("sp.token"); setToken(""); setStatus("idle"); return; }
      if (!r.ok) throw new Error("Spotify API " + r.status);
      const data = await r.json();
      const seen = new Set();
      const list = [];
      for (const it of data.items || []) {
        const t = it.track;
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        list.push({ id: t.id, name: t.name, artist: (t.artists || []).map((a) => a.name).join(", "), url: t.external_urls?.spotify });
        if (list.length >= 15) break;
      }
      setTracks(list); setStatus("idle");
    } catch (e) { setErr(String(e.message || e)); setStatus("error"); }
  };

  useEffect(() => { if (token) fetchRecent(); /* eslint-disable-next-line */ }, [token]);

  // auto key lookup via the proxy, once per track
  useEffect(() => {
    if (!proxy || tracks.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const t of tracks) {
        if (fetched.current.has(t.id)) continue;
        fetched.current.add(t.id);
        setKeyMap((m) => ({ ...m, [t.id]: { status: "loading" } }));
        try {
          const sep = proxy.includes("?") ? "&" : "?";
          const r = await fetch(proxy + sep + "q=" + encodeURIComponent(`${t.name} ${t.artist}`));
          const d = await r.json();
          if (cancelled) return;
          setKeyMap((m) => ({ ...m, [t.id]: { status: "done", key: d.key || null } }));
        } catch {
          if (cancelled) return;
          setKeyMap((m) => ({ ...m, [t.id]: { status: "error" } }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxy, tracks]);

  const saveProxy = () => { const v = proxyInput.trim(); ls.set("key.proxy", v); setProxy(v); fetched.current = new Set(); setKeyMap({}); };
  const logout = () => { ["sp.token", "sp.refresh", "sp.exp"].forEach(ls.del); setToken(""); setTracks([]); };

  return (
    <div className="sp-wrap">
      <style>{`
        .sp-wrap{ border:1.5px solid ${C.line}; border-radius:6px; padding:14px 16px; margin-bottom:16px; background: rgba(29,185,84,.06); }
        .sp-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${C.muted}; }
        .sp-mono{ font-family: ui-monospace, monospace; }
        .sp-btn{ font-family: ui-monospace, monospace; font-size: 12px; padding: 7px 12px; border-radius: 3px; cursor: pointer;
          border:1.5px solid ${C.line}; background: rgba(255,255,255,.05); color:${C.ink}; }
        .sp-btn.green{ border-color:${C.green}; background:${C.green}; color:#04130a; font-weight:700; }
        .sp-link{ font-family: ui-monospace, monospace; font-size: 11px; text-decoration:none; padding:4px 8px; border-radius:3px;
          border:1.5px solid ${C.line}; background: rgba(255,255,255,.05); color:${C.ink}; }
        .sp-link:hover{ border-color:${C.ink}; }
        .sp-key{ font-family: ui-monospace, monospace; font-weight:700; font-size:13px; min-width:42px; text-align:center;
          padding:4px 8px; border-radius:3px; border:1.5px solid ${C.sunDeep}; color:${C.sun}; background: rgba(255,122,46,.12); text-decoration:none; }
        .sp-row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 0; border-bottom:1px dashed ${C.grid}; }
        .sp-row .t{ flex:1 1 200px; font-family: ui-monospace, monospace; font-size:12.5px; }
        .sp-in{ font-family: ui-monospace, monospace; font-size:12px; padding:7px 9px; border-radius:3px; border:1.5px solid ${C.line};
          background:#0b0b0b; color:${C.ink}; min-width: 240px; }
      `}</style>

      <div className="sp-eyebrow" style={{ marginBottom: 8, color: C.green }}>♫ From your Spotify — recently played</div>

      {!token ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="sp-btn green" onClick={login}>Connect Spotify</button>
          {status === "loading" && <span className="sp-mono" style={{ fontSize: 11, color: C.muted }}>connecting…</span>}
          {status === "error" && <span className="sp-mono" style={{ fontSize: 11, color: C.red }}>{err}</span>}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="sp-btn" onClick={fetchRecent}>↻ refresh</button>
            <button className="sp-btn" onClick={logout}>disconnect</button>
            {status === "loading" && <span className="sp-mono" style={{ fontSize: 11, color: C.muted }}>loading…</span>}
            {status === "error" && <span className="sp-mono" style={{ fontSize: 11, color: C.red }}>{err}</span>}
          </div>

          {!proxy && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className="sp-mono" style={{ fontSize: 11, color: C.muted }}>Auto-key off — paste a key-proxy URL (see /worker) to show keys automatically:</span>
              <input className="sp-in" placeholder="https://getkey.you.workers.dev" value={proxyInput} onChange={(e) => setProxyInput(e.target.value)} />
              <button className="sp-btn" onClick={saveProxy}>Save</button>
            </div>
          )}

          {tracks.length === 0 && status === "idle" && (
            <div className="sp-mono" style={{ fontSize: 12, color: C.muted }}>No recent tracks yet — play something on Spotify, then refresh.</div>
          )}

          {tracks.map((t) => {
            const q = `${t.name} ${t.artist}`;
            const k = keyMap[t.id];
            return (
              <div key={t.id} className="sp-row">
                <span className="t">{t.name} <span style={{ color: C.muted }}>— {t.artist}</span></span>
                {proxy ? (
                  k?.status === "done" && k.key ? (
                    <a className="sp-key" href={yt(`${k.key} backing track`)} target="_blank" rel="noopener noreferrer" title="Open a backing track in this key">{k.key}</a>
                  ) : k?.status === "loading" ? (
                    <span className="sp-mono" style={{ fontSize: 11, color: C.muted, minWidth: 42, textAlign: "center" }}>…</span>
                  ) : (
                    <a className="sp-link" href={tunebat(q)} target="_blank" rel="noopener noreferrer">find key</a>
                  )
                ) : (
                  <a className="sp-link" href={tunebat(q)} target="_blank" rel="noopener noreferrer">🔑 key</a>
                )}
                {onPickKey && k?.status === "done" && k.key && (
                  <button className="sp-link" style={{ cursor: "pointer", borderColor: C.sun, color: C.sun }} onClick={() => onPickKey(k.key)} title="Load this key onto the fretboard">▸ practice</button>
                )}
                {actions && actions(t, k?.status === "done" ? k.key : null)}
                <a className="sp-link" href={yt(q + " backing track")} target="_blank" rel="noopener noreferrer">▶ jam</a>
              </div>
            );
          })}

          <div className="sp-mono" style={{ fontSize: 10.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            {proxy ? (
              <>Keys auto-detected — tap a key to open a backing track in it. Key/BPM data by <a className="sp-link" style={{ padding: "1px 5px" }} href="https://getsongbpm.com" target="_blank" rel="noopener noreferrer">GetSongBPM</a>. A song's key can vary with capo/tuning. <button className="sp-link" style={{ cursor: "pointer" }} onClick={() => { ls.del("key.proxy"); setProxy(""); }}>change proxy</button></>
            ) : (
              <>"🔑 key" opens a key-finder site for that song. Add a key-proxy (see the worker/ folder) to show keys here automatically.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
