const APPS_URL = 'https://script.google.com/macros/s/AKfycbxZbMI8glMm-s41opBmGkm9ENl2-HLRaahx5f3HCoaGxvtudjobGLjmhl5biamUZIxGdA/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const body = req.body;

    if (body.type === 'apps_script' || body.dosyaAdi) {
      const payload = body.type === 'apps_script' ? body.payload : body;
      const r = await fetch(APPS_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const text = await r.text();
      try { return res.status(200).json(JSON.parse(text)); }
      catch(e) { return res.status(200).json({durum:'hata', mesaj:text.substring(0,200)}); }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({error:'ANTHROPIC_API_KEY tanimli degil'});

    const { system, user, useHaiku, useSearch } = body;
    if (!system || !user) return res.status(400).json({error:'system ve user gerekli'});

    const model = useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';

    const requestBody = {
      model: model,
      max_tokens: 3000,
      system: system,
      messages: [{role:'user', content: user}]
    };

    if (useSearch) {
      requestBody.tools = [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({error:'Anthropic API hatasi: '+err});
    }

    const data = await response.json();
    const text = data.content
      ?.filter(b => b.type === 'text')
      ?.map(b => b.text)
      ?.join('') || '';

    return res.status(200).json({text});
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}