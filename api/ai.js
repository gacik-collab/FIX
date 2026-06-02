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

    // Trademap fetch modu
    if (body.type === 'trademap') {
      const hs6 = body.hs6;
      const url = `https://www.trademap.org/Country_SelProductCountry_TS.aspx?nvpm=1%7c792%7c%7c%7c%7c${hs6}%7c%7c%7c6%7c1%7c1%7c2%7c2%7c1%7c2%7c1%7c1%7c1`;
      const tmRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
        }
      });
      const html = await tmRes.text();
      // HTML'den tablo verisi cikar - AI ile parse et
      const parseRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Bu Trademap HTML sayfasindan Turkiye'nin ${hs6} GTİP kodlu urun icin ihracat verilerini cikar. SADECE JSON don dur:\n{"toplam":"$X.XXX USD","ulkeler":[["Ulke","$XXX.XXX","XX%"],...]}\n\nNot: Trademap'te rakamlar 1000 USD birimindedir, gercek degeri hesapla (1000 ile carp).\n\nHTML (ilk 8000 karakter):\n${html.substring(0,8000)}`
          }]
        })
      });
      const parseData = await parseRes.json();
      const parseText = parseData.content?.[0]?.text || '';
      try {
        const clean = parseText.replace(/```json|```/g,'').trim();
        return res.status(200).json(JSON.parse(clean));
      } catch(e) {
        return res.status(200).json({toplam:'Veri alinamadi', ulkeler:[], raw:parseText.substring(0,500)});
      }
    }

    // Web arastirma modu - musteriler icin
    if (body.type === 'research') {
      const { query, hs6, urun } = body;
      const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          tools: [{type:'web_search_20250305',name:'web_search'}],
          messages: [{
            role: 'user',
            content: query
          }]
        })
      });
      const searchData = await searchRes.json();
      const allText = (searchData.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
      try {
        const clean = allText.replace(/```json|```/g,'').trim();
        return res.status(200).json(JSON.parse(clean));
      } catch(e) {
        return res.status(200).json({raw: allText.substring(0,1000)});
      }
    }

    // Standart AI modu
    const { system, user } = body;
    if (!system || !user) return res.status(400).json({error:'system ve user gerekli'});

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
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