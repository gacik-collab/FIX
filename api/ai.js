const APPS_URL = 'https://script.google.com/macros/s/AKfycbxZbMI8glMm-s41opBmGkm9ENl2-HLRaahx5f3HCoaGxvtudjobGLjmhl5biamUZIxGdA/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const body = req.body;

    // Apps Script proxy
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

    // Standart AI modu - Sonnet ile daha guclu
    const { system, user, useHaiku } = body;
    if (!system || !user) return res.status(400).json({error:'system ve user gerekli'});

    // Trademap/pazar sorgusu icin Sonnet, diger sorgular icin Haiku
    const model = useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 3000,
        messages: [{role:'user', content: system + '\n\n' + user}]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({error:'Anthropic API hatasi: '+err});
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({text});

  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}