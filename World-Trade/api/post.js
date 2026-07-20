// api/post.js
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, image, platform } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  // -----------------------------------------------
  // 1. GRAB SECRETS FROM ENVIRONMENT VARIABLES
  //    (You set these in Vercel Dashboard)
  // -----------------------------------------------
  const BLUESKY_IDENTIFIER = process.env.BLUESKY_IDENTIFIER;
  const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD;
  const MASTODON_INSTANCE = process.env.MASTODON_INSTANCE || 'mastodon.social';
  const MASTODON_TOKEN = process.env.MASTODON_TOKEN;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  const results = [];

  // Helper to post to Bluesky
  async function postToBluesky(text, image) {
    try {
      if (!BLUESKY_IDENTIFIER || !BLUESKY_PASSWORD) throw new Error('Missing Bluesky credentials');
      const loginRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: BLUESKY_IDENTIFIER, password: BLUESKY_PASSWORD })
      });
      const { accessJwt } = await loginRes.json();
      if (!accessJwt) throw new Error('Bluesky login failed');

      const postBody = {
        repo: BLUESKY_IDENTIFIER,
        collection: 'app.bsky.feed.post',
        record: {
          text: text,
          createdAt: new Date().toISOString(),
          $type: 'app.bsky.feed.post'
        }
      };
      const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessJwt}` },
        body: JSON.stringify(postBody)
      });
      if (!postRes.ok) throw new Error(await postRes.text());
      return true;
    } catch (e) {
      console.error('Bluesky error:', e.message);
      return false;
    }
  }

  // Helper to post to Mastodon
  async function postToMastodon(text, image) {
    try {
      if (!MASTODON_TOKEN) throw new Error('Missing Mastodon token');
      const formData = new FormData();
      formData.append('status', text);
      if (image) {
        const imgRes = await fetch(image);
        const blob = await imgRes.blob();
        formData.append('media[]', blob, 'image.jpg');
      }
      const res = await fetch(`https://${MASTODON_INSTANCE}/api/v1/statuses`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MASTODON_TOKEN}` },
        body: formData
      });
      if (!res.ok) throw new Error(await res.text());
      return true;
    } catch (e) {
      console.error('Mastodon error:', e.message);
      return false;
    }
  }

  // Helper to post to Telegram
  async function postToTelegram(text, image) {
    try {
      if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Missing Telegram credentials');
      let url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      if (image) {
        url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
        const imgRes = await fetch(image);
        const blob = await imgRes.blob();
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('photo', blob, 'image.jpg');
        formData.append('caption', text);
        const res = await fetch(url, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(await res.text());
        return true;
      } else {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' })
        });
        if (!res.ok) throw new Error(await res.text());
        return true;
      }
    } catch (e) {
      console.error('Telegram error:', e.message);
      return false;
    }
  }

  // -----------------------------------------------
  // 2. EXECUTE BASED ON PLATFORM FLAG
  // -----------------------------------------------
  if (platform === 'all') {
    const [bsky, masto, tele] = await Promise.all([
      postToBluesky(text, image),
      postToMastodon(text, image),
      postToTelegram(text, image)
    ]);
    results.push({ platform: 'Bluesky', success: bsky });
    results.push({ platform: 'Mastodon', success: masto });
    results.push({ platform: 'Telegram', success: tele });
  } else if (platform === 'bluesky') {
    const success = await postToBluesky(text, image);
    results.push({ platform: 'Bluesky', success });
  } else if (platform === 'mastodon') {
    const success = await postToMastodon(text, image);
    results.push({ platform: 'Mastodon', success });
  } else if (platform === 'telegram') {
    const success = await postToTelegram(text, image);
    results.push({ platform: 'Telegram', success });
  } else {
    return res.status(400).json({ error: 'Invalid platform specified' });
  }

  // -----------------------------------------------
  // 3. RETURN RESULTS (FIXED FOR FRONTEND COMPATIBILITY)
  // -----------------------------------------------
  // If 'all' platforms were requested, return the full array.
  if (platform === 'all') {
    return res.status(200).json(results);
  } 
  // For single platform requests, return ONLY the first result object.
  // This allows your frontend to check `result.success` directly.
  else {
    return res.status(200).json(results[0]);
  }
}
