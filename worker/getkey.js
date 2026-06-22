/**
 * getkey — a tiny Cloudflare Worker that proxies the GetSongBPM API so the
 * static guitar app can look up a song's key automatically. It hides your API
 * key and adds CORS headers (which GetSongBPM itself does not send), so the
 * browser is allowed to call it.
 *
 * SETUP (one time, free):
 *  1. Get a free API key at https://getsongbpm.com/api (a backlink to
 *     getsongbpm.com is required by their terms — the app shows one).
 *  2. Create a Cloudflare account → Workers & Pages → Create Worker.
 *  3. Paste this file as the worker code and Deploy.
 *  4. In the worker's Settings → Variables, add a secret:
 *        GETSONGBPM_KEY = <your api key>
 *  5. Copy the worker URL (e.g. https://getkey.<you>.workers.dev) and paste it
 *     into the app's "key proxy URL" field.
 *
 * The app calls:  <worker-url>?q=<song title artist>
 * and gets back:  { "key": "Em", "tempo": "220", "title": "...", "artist": "..." }
 */
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const q = new URL(request.url).searchParams.get("q");
    if (!q) return json({ error: "missing q" }, 400, cors);
    if (!env.GETSONGBPM_KEY) return json({ error: "GETSONGBPM_KEY not set" }, 500, cors);

    const api =
      "https://api.getsong.co/search/?api_key=" + env.GETSONGBPM_KEY +
      "&type=both&limit=1&lookup=" + encodeURIComponent(q);

    try {
      const r = await fetch(api, { headers: { Accept: "application/json" } });
      const data = await r.json();
      // /search/ returns { search: [ {...} ] } on hit, or { search: { error } } on miss
      const hit = Array.isArray(data.search) ? data.search[0] : null;
      if (!hit) return json({ key: null }, 200, cors);
      return json(
        { key: hit.key_of || null, tempo: hit.tempo || null, title: hit.title, artist: hit.artist?.name },
        200,
        cors
      );
    } catch (e) {
      return json({ error: String(e) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
