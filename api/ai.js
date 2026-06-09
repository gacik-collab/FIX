const APPS_URL = 'https://script.google.com/macros/s/AKfycbxZbMI8glMm-s41opBmGkm9ENl2-HLRaahx5f3HCoaGxvtudjobGLjmhl5biamUZIxGdA/exec';

async function trademap(hs6) {
  const url = `https://www.trademap.org/Country_SelProductCountry.aspx?nvpm=1%7c792%7c%7c%7c%7c${hs6}%7c%7c%7c6%7c1%7c1%7c2%7c2%7c1%7c2%7c1%7c1%7c1`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    }
  });
  const html = await r.text();
  const rows = [];
  const tableMatch = html.match(/tdProductCountry[\s\S]*?<\/table>/);
  if (!tableMatch) return null;
  const trMatches = tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  let total = '';
  for (const tr of trMatches) {
    const cells = [];
    const tdMatches = tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g);
    for (const td of tdMatches) {
      const text = td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      cells.push(text);
    }
    if (cells.length >= 3 && cells[1]) {
      const country = cells[1];
      const value = cells[2];
      if (country === 'World') {
        total = value + ' USD thousand';
      } else if (country && value && !country.includes('Select')) {
        const share = cells[4] || '';
        rows.push([country, value + ' USD thousand', share + '%']);
      }
    }
  }
  return { toplam: total, ulkeler: rows.slice(0, 10) };
}

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
    if (body.type === 'trademap') {
      const data = await trademap(body.hs6);
      if (data) return res.status(200).json(data);
      return res.status(200).json({toplam:'', ulkeler:[]});
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({error:'ANTHROPIC_API_KEY tanimli degil'});
    const { system, user, useHaiku, useWebSearch } = body;
    if (!system || !user) return res.status(400).json({error:'system ve user gerekli'});
    const model = useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
    const maxTokens = useWebSearch ? 4000 : 2000;
    const messages = [{role:'user', content: system + '\n\n' + user}];
    const tools = useWebSearch ? [{type: 'web_search_20250305', name: 'web_search'}] : undefined;

    let finalText = '';
    for (let turn = 0; turn < 8; turn++) {
      const bodyObj = { model, max_tokens: maxTokens, messages };
      if (tools) bodyObj.tools = tools;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(bodyObj)
      });
      if (!response.ok) {
        const err = await response.text();
        return res.status(500).json({error:'Anthropic API hatasi: '+err});
      }
      const data = await response.json();
      const textBlocks = data.content?.filter(b => b.type === 'text') || [];
      if (textBlocks.length > 0) {
        finalText = textBlocks.map(b => b.text).join('');
      }
      if (data.stop_reason === 'end_turn' || data.stop_reason === 'stop_sequence') break;
      const toolUseBlocks = data.content?.filter(b => b.type === 'tool_use') || [];
      if (toolUseBlocks.length === 0) break;
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = toolUseBlocks.map(tu => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: '(web search tamamlandi)'
      }));
      messages.push({ role: 'user', content: toolResults });
    }

    return res.status(200).json({text: finalText});
  } catch(e) {
    return res.status(500).json({error:e.message});
  }
}