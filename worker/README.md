# getkey worker — automatic song-key lookup

The guitar app is a static site, so it can't safely hold an API key or bypass
CORS on its own. This one-file Cloudflare Worker does both: it proxies the
[GetSongBPM](https://getsongbpm.com/api) API, hides your key, and returns clean
JSON the browser can read.

## Deploy (free, ~5 minutes)

1. **Get a GetSongBPM API key** at https://getsongbpm.com/api (free; their terms
   require a visible backlink to getsongbpm.com — the app already shows one).
2. **Create the worker:** Cloudflare dashboard → *Workers & Pages* → *Create
   Worker*. Paste `getkey.js`, click **Deploy**.
3. **Add your key:** worker → *Settings* → *Variables and Secrets* → add
   `GETSONGBPM_KEY` = your API key. Redeploy.
4. **Copy the worker URL** (like `https://getkey.yourname.workers.dev`).
5. In the app's Spotify panel, paste that URL into **"key proxy URL"**. Keys now
   appear next to each recently-played song automatically.

Any host works (Vercel/Netlify functions, etc.) as long as the endpoint accepts
`?q=<title artist>` and returns `{ "key": "Em" }` with permissive CORS.
