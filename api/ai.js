export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  try {
    const { system, user } = req.body;
    if (!system || !user) return res.status(400).json({error: 'system ve user gerekli'});

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({error: 'ANTHROPIC_API_KEY tanımlı değil'});

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
        messages: [
          { role: 'user', content: system + '\n\n' + user }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({error: 'Anthropic API hatası: ' + err});
    }

    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : '';
    return res.status(200).json({text});

  } catch(e) {
    console.error('API Error:', e);
    return res.status(500).json({error: e.message});
  }
}
