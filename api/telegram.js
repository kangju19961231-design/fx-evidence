// Telegram Bot Webhook â Vercel Serverless Function
// Flow: Telegram photo â Claude OCR â Supabase save â Reply

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_ID = parseInt(process.env.TELEGRAM_ALLOWED_CHAT_ID || '0');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;
  const message = update?.message;
  if (!message) return res.status(200).json({ ok: true });

  const chatId = message.chat?.id;

  // è¨±å¯ãããã¦ã¼ã¶ã¼ã®ã¿å¦ç
  if (chatId !== ALLOWED_CHAT_ID) {
    return res.status(200).json({ ok: true });
  }

  // ãã­ã¹ãã³ãã³ãå¦ç
  if (message.text) {
    if (message.text === '/start' || message.text === '/help') {
      await sendMessage(chatId,
        'ð¸ <b>FX Evidence Bot</b>\n\n' +
        'MT5ã®ç´å®å±¥æ­´ï¼ç´å®ã¿ãï¼ã®ã¹ã¯ãªã¼ã³ã·ã§ãããéãã¨èªåã§è¨é²ãã¾ãã\n\n' +
        '1æ¥1æã1æ¥åã®åå¼ãã¾ã¨ããã¹ã¯ãªã¼ã³ã·ã§ãããéã£ã¦ãã ããã'
      );
    } else if (message.text === '/status') {
      const count = await getRecordCount();
      await sendMessage(chatId, `ð ç¾å¨ ${count} æ¥åã®ãã¼ã¿ãè¨é²ããã¦ãã¾ãã`);
    }
    return res.status(200).json({ ok: true });
  }

  // åçå¦ç
  if (!message.photo) {
    await sendMessage(chatId, 'ð¸ MT5ã®ç´å®å±¥æ­´ã®ã¹ã¯ãªã¼ã³ã·ã§ãããéã£ã¦ãã ããã');
    return res.status(200).json({ ok: true });
  }

  // å¦çä¸­ã¡ãã»ã¼ã¸
  await sendMessage(chatId, 'â³ èª­ã¿åãä¸­...');

  try {
    // æé«ç»è³ªã®åçãåå¾
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    // Telegramãããã¡ã¤ã«URLãåå¾
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('ãã¡ã¤ã«æå ±ã®åå¾ã«å¤±æãã¾ãã');

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // ç»åããã¦ã³ã­ã¼ã
    const imageRes = await fetch(fileUrl);
    if (!imageRes.ok) throw new Error('ç»åã®ãã¦ã³ã­ã¼ãã«å¤±æãã¾ãã');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Claude APIã§ç»åè§£æ
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `ãã®MT5ã®ç´å®å±¥æ­´ï¼ç´å®ã¿ãï¼ã¹ã¯ãªã¼ã³ã·ã§ãããè§£æãã¦ãä»¥ä¸ã¯JSONã®ã¿è¿ãã¦ãã ãããèª¬ææã¯ä¸è¦ã§ãã

{
  "trade_date": "YYYY-MM-DD",
  "settlements": <æ±ºæ¸åæ°ï¼"out"ã®åå¼æ°ï¼>,
  "wins": <åã¡æ°ï¼ãã©ã¹ã¯P&Låå¼æ°ï¼>,
  "losses": <è² ãæ°ï¼ãã¤ãã¹ã®P&Låå¼æ°ï¼>,
  "pnl": <æçåè¨ï¼ç»é¢ä¸é¨ã®ãæç:ãã®æ°å¤ãã¹ãã¼ã¹ãªãã¯æ°å¤ï¼>
}

ã«ã¼ã«ï¼
- "out"ï¼æ±ºæ¸ã»ã¯ã­ã¼ãºï¼ã®åå¼ã®ã¿ã«ã¦ã³ãã"in"ï¼ã¨ã³ããªã¼ï¼ã¯é¤ã
- trade_dateã¯ç»é¢åã®åå¼æ¥ä»ï¼ä¾: "2026.03.09" â "2026-03-09"ï¼
- pnlã¯æçæ¬ã®æ°å¤ããã®ã¾ã¾ï¼ä¾: "1 467.77" â 1467.77ï¼
- JSONã®ã¿ãã³ã¼ããã­ãã¯ãä¸è¦`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeData.content?.[0]?.text) throw new Error('Claude APIããã®å¿ç­ãä¸æ­£ã§ã');

    const responseText = claudeData.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`JSONãè¦ã¤ããã¾ãã: ${responseText}`);

    const parsed = JSON.parse(jsonMatch[0]);

    // ããªãã¼ã·ã§ã³
    if (!parsed.trade_date || typeof parsed.settlements !== 'number') {
      throw new Error('ãã¼ã¿ã®è§£æã«å¤±æãã¾ãã');
    }

    // åçè¨ç®
    const winRate = parsed.settlements > 0
      ? Math.round((parsed.wins / parsed.settlements) * 1000) / 10
      : 0;

    // ã¹ã¯ãªã¼ã³ã·ã§ãããSupabase Storageã«ã¢ããã­ã¼ã
    let screenshotUrl = null;
    try {
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/screenshots/${parsed.trade_date}.jpg`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true'
          },
          body: imageBuffer
        }
      );
      if (uploadRes.ok) {
        screenshotUrl = `${SUPABASE_URL}/storage/v1/object/public/screenshots/${parsed.trade_date}.jpg`;
      }
    } catch (e) {
      console.error('Storage upload error:', e);
    }

    // Supabaseã«upsertï¼åãæ¥ä»ãªãä¸æ¸ãï¼
    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_records`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          trade_date: parsed.trade_date,
          settlements: parsed.settlements,
          wins: parsed.wins,
          losses: parsed.losses,
          pnl: parsed.pnl,
          screenshot_url: screenshotUrl
        })
      }
    );

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      throw new Error(`Supabaseä¿å­ã¨ã©ã¼: ${err}`);
    }

    // æåã¡ãã»ã¼ã¸
    const sign = parsed.pnl >= 0 ? '+' : '';
    const pnlFormatted = Math.abs(parsed.pnl).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const pnlStr = `${sign}Â¥${parsed.pnl < 0 ? '-' : ''}${pnlFormatted}`;

    await sendMessage(chatId,
      `â <b>${parsed.trade_date} ã®è¨é²å®äºï¼</b>\n\n` +
      `ð æ±ºæ¸åæ°: <b>${parsed.settlements}å</b>\n` +
      `ð¢ åã¡: <b>${parsed.wins}å</b>\n` +
      `ð´ è² ã: <b>${parsed.losses}å</b>\n` +
      `ð åç: <b>${winRate}%</b>\n` +
      `ð´ æç: <b>${sign}Â¥${pnlFormatted}</b>`
    );

  } catch (error) {
    console.error('Error:', error);
    await sendMessage(chatId,
      `â ã¨ã©ã¼ãçºçãã¾ãã\n${error.message}\n\nããä¸åº¦éã£ã¦ãã ããã`
    );
  }

  return res.status(200).json({ ok: true });
}

async function sendMessage(chatId, text) {
  return fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    }
  );
}

async function getRecordCount() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_records?select=count`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
          'Prefer': 'count=exact'
        }
      }
    );
    const countHeader = res.headers.get('content-range');
    return countHeader ? countHeader.split('/')[1] : 'ä¸æ';
  } catch {
    return 'ä¸æ';
  }
}
