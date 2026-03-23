// Telegram Bot Webhook Ã¢ÂÂ Vercel Serverless Function
// Flow: Telegram photo Ã¢ÂÂ Claude OCR Ã¢ÂÂ Supabase save Ã¢ÂÂ Reply

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

  // Ã¨Â¨Â±Ã¥ÂÂ¯Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ£ÂÂ¦Ã£ÂÂ¼Ã£ÂÂ¶Ã£ÂÂ¼Ã£ÂÂ®Ã£ÂÂ¿Ã¥ÂÂ¦Ã§ÂÂ
  if (chatId !== ALLOWED_CHAT_ID) {
    return res.status(200).json({ ok: true });
  }

  // Ã£ÂÂÃ£ÂÂ­Ã£ÂÂ¹Ã£ÂÂÃ£ÂÂ³Ã£ÂÂÃ£ÂÂ³Ã£ÂÂÃ¥ÂÂ¦Ã§ÂÂ
  if (message.text) {
    if (message.text === '/start' || message.text === '/help') {
      await sendMessage(chatId,
        'Ã°ÂÂÂ¸ <b>FX Evidence Bot</b>\n\n' +
        'MT5Ã£ÂÂ®Ã§Â´ÂÃ¥Â®ÂÃ¥Â±Â¥Ã¦Â­Â´Ã¯Â¼ÂÃ§Â´ÂÃ¥Â®ÂÃ£ÂÂ¿Ã£ÂÂÃ¯Â¼ÂÃ£ÂÂ®Ã£ÂÂ¹Ã£ÂÂ¯Ã£ÂÂªÃ£ÂÂ¼Ã£ÂÂ³Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ©ÂÂÃ£ÂÂÃ£ÂÂ¨Ã¨ÂÂªÃ¥ÂÂÃ£ÂÂ§Ã¨Â¨ÂÃ©ÂÂ²Ã£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ\n\n' +
        '1Ã¦ÂÂ¥1Ã¦ÂÂÃ£ÂÂ1Ã¦ÂÂ¥Ã¥ÂÂÃ£ÂÂ®Ã¥ÂÂÃ¥Â¼ÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂ¨Ã£ÂÂÃ£ÂÂÃ£ÂÂ¹Ã£ÂÂ¯Ã£ÂÂªÃ£ÂÂ¼Ã£ÂÂ³Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ©ÂÂÃ£ÂÂ£Ã£ÂÂ¦Ã£ÂÂÃ£ÂÂ Ã£ÂÂÃ£ÂÂÃ£ÂÂ'
      );
    } else if (message.text === '/status') {
      const count = await getRecordCount();
      await sendMessage(chatId, `Ã°ÂÂÂ Ã§ÂÂ¾Ã¥ÂÂ¨ ${count} Ã¦ÂÂ¥Ã¥ÂÂÃ£ÂÂ®Ã£ÂÂÃ£ÂÂ¼Ã£ÂÂ¿Ã£ÂÂÃ¨Â¨ÂÃ©ÂÂ²Ã£ÂÂÃ£ÂÂÃ£ÂÂ¦Ã£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ`);
    }
    return res.status(200).json({ ok: true });
  }

  // Ã¥ÂÂÃ§ÂÂÃ¥ÂÂ¦Ã§ÂÂ
  if (!message.photo) {
    await sendMessage(chatId, 'Ã°ÂÂÂ¸ MT5Ã£ÂÂ®Ã§Â´ÂÃ¥Â®ÂÃ¥Â±Â¥Ã¦Â­Â´Ã£ÂÂ®Ã£ÂÂ¹Ã£ÂÂ¯Ã£ÂÂªÃ£ÂÂ¼Ã£ÂÂ³Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ©ÂÂÃ£ÂÂ£Ã£ÂÂ¦Ã£ÂÂÃ£ÂÂ Ã£ÂÂÃ£ÂÂÃ£ÂÂ');
    return res.status(200).json({ ok: true });
  }

  // Ã¥ÂÂ¦Ã§ÂÂÃ¤Â¸Â­Ã£ÂÂ¡Ã£ÂÂÃ£ÂÂ»Ã£ÂÂ¼Ã£ÂÂ¸
  await sendMessage(chatId, 'Ã¢ÂÂ³ Ã¨ÂªÂ­Ã£ÂÂ¿Ã¥ÂÂÃ£ÂÂÃ¤Â¸Â­...');

  try {
    // Ã¦ÂÂÃ©Â«ÂÃ§ÂÂ»Ã¨Â³ÂªÃ£ÂÂ®Ã¥ÂÂÃ§ÂÂÃ£ÂÂÃ¥ÂÂÃ¥Â¾Â
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    // TelegramÃ£ÂÂÃ£ÂÂÃ£ÂÂÃ£ÂÂ¡Ã£ÂÂ¤Ã£ÂÂ«URLÃ£ÂÂÃ¥ÂÂÃ¥Â¾Â
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('Ã£ÂÂÃ£ÂÂ¡Ã£ÂÂ¤Ã£ÂÂ«Ã¦ÂÂÃ¥Â Â±Ã£ÂÂ®Ã¥ÂÂÃ¥Â¾ÂÃ£ÂÂ«Ã¥Â¤Â±Ã¦ÂÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ');

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // Ã§ÂÂ»Ã¥ÂÂÃ£ÂÂÃ£ÂÂÃ£ÂÂ¦Ã£ÂÂ³Ã£ÂÂ­Ã£ÂÂ¼Ã£ÂÂ
    const imageRes = await fetch(fileUrl);
    if (!imageRes.ok) throw new Error('Ã§ÂÂ»Ã¥ÂÂÃ£ÂÂ®Ã£ÂÂÃ£ÂÂ¦Ã£ÂÂ³Ã£ÂÂ­Ã£ÂÂ¼Ã£ÂÂÃ£ÂÂ«Ã¥Â¤Â±Ã¦ÂÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Claude APIÃ£ÂÂ§Ã§ÂÂ»Ã¥ÂÂÃ¨Â§Â£Ã¦ÂÂ
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
              text: `Ã£ÂÂÃ£ÂÂ®MT5Ã£ÂÂ®Ã§Â´ÂÃ¥Â®ÂÃ¥Â±Â¥Ã¦Â­Â´Ã¯Â¼ÂÃ§Â´ÂÃ¥Â®ÂÃ£ÂÂ¿Ã£ÂÂÃ¯Â¼ÂÃ£ÂÂ¹Ã£ÂÂ¯Ã£ÂÂªÃ£ÂÂ¼Ã£ÂÂ³Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ¨Â§Â£Ã¦ÂÂÃ£ÂÂÃ£ÂÂ¦Ã£ÂÂÃ¤Â»Â¥Ã¤Â¸ÂÃ£ÂÂ¯JSONÃ£ÂÂ®Ã£ÂÂ¿Ã¨Â¿ÂÃ£ÂÂÃ£ÂÂ¦Ã£ÂÂÃ£ÂÂ Ã£ÂÂÃ£ÂÂÃ£ÂÂÃ¨ÂªÂ¬Ã¦ÂÂÃ¦ÂÂÃ£ÂÂ¯Ã¤Â¸ÂÃ¨Â¦ÂÃ£ÂÂ§Ã£ÂÂÃ£ÂÂ

{
  "trade_date": "YYYY-MM-DD",
  "settlements": <Ã¦Â±ÂºÃ¦Â¸ÂÃ¥ÂÂÃ¦ÂÂ°Ã¯Â¼Â"out"Ã£ÂÂ®Ã¥ÂÂÃ¥Â¼ÂÃ¦ÂÂ°Ã¯Â¼Â>,
  "wins": <Ã¥ÂÂÃ£ÂÂ¡Ã¦ÂÂ°Ã¯Â¼ÂÃ£ÂÂÃ£ÂÂ©Ã£ÂÂ¹Ã£ÂÂ¯P&LÃ¥ÂÂÃ¥Â¼ÂÃ¦ÂÂ°Ã¯Â¼Â>,
  "losses": <Ã¨Â²Â Ã£ÂÂÃ¦ÂÂ°Ã¯Â¼ÂÃ£ÂÂÃ£ÂÂ¤Ã£ÂÂÃ£ÂÂ¹Ã£ÂÂ®P&LÃ¥ÂÂÃ¥Â¼ÂÃ¦ÂÂ°Ã¯Â¼Â>,
  "pnl": <Ã¦ÂÂÃ§ÂÂÃ¥ÂÂÃ¨Â¨ÂÃ¯Â¼ÂÃ§ÂÂ»Ã©ÂÂ¢Ã¤Â¸ÂÃ©ÂÂ¨Ã£ÂÂ®Ã£ÂÂÃ¦ÂÂÃ§ÂÂ:Ã£ÂÂÃ£ÂÂ®Ã¦ÂÂ°Ã¥ÂÂ¤Ã£ÂÂÃ£ÂÂ¹Ã£ÂÂÃ£ÂÂ¼Ã£ÂÂ¹Ã£ÂÂªÃ£ÂÂÃ£ÂÂ¯Ã¦ÂÂ°Ã¥ÂÂ¤Ã¯Â¼Â>
}

Ã£ÂÂ«Ã£ÂÂ¼Ã£ÂÂ«Ã¯Â¼Â
- "out"Ã¯Â¼ÂÃ¦Â±ÂºÃ¦Â¸ÂÃ£ÂÂ»Ã£ÂÂ¯Ã£ÂÂ­Ã£ÂÂ¼Ã£ÂÂºÃ¯Â¼ÂÃ£ÂÂ®Ã¥ÂÂÃ¥Â¼ÂÃ£ÂÂ®Ã£ÂÂ¿Ã£ÂÂ«Ã£ÂÂ¦Ã£ÂÂ³Ã£ÂÂÃ£ÂÂ"in"Ã¯Â¼ÂÃ£ÂÂ¨Ã£ÂÂ³Ã£ÂÂÃ£ÂÂªÃ£ÂÂ¼Ã¯Â¼ÂÃ£ÂÂ¯Ã©ÂÂ¤Ã£ÂÂ
- trade_dateÃ£ÂÂ¯Ã§ÂÂ»Ã©ÂÂ¢Ã¥ÂÂÃ£ÂÂ®Ã¥ÂÂÃ¥Â¼ÂÃ¦ÂÂ¥Ã¤Â»ÂÃ¯Â¼ÂÃ¤Â¾Â: "2026.03.09" Ã¢ÂÂ "2026-03-09"Ã¯Â¼Â
- pnlÃ£ÂÂ¯Ã¦ÂÂÃ§ÂÂÃ¦Â¬ÂÃ£ÂÂ®Ã¦ÂÂ°Ã¥ÂÂ¤Ã£ÂÂÃ£ÂÂÃ£ÂÂ®Ã£ÂÂ¾Ã£ÂÂ¾Ã¯Â¼ÂÃ¤Â¾Â: "1 467.77" Ã¢ÂÂ 1467.77Ã¯Â¼Â
- JSONÃ£ÂÂ®Ã£ÂÂ¿Ã£ÂÂÃ£ÂÂ³Ã£ÂÂ¼Ã£ÂÂÃ£ÂÂÃ£ÂÂ­Ã£ÂÂÃ£ÂÂ¯Ã£ÂÂÃ¤Â¸ÂÃ¨Â¦Â`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeData.content?.[0]?.text) throw new Error('Claude APIÃ£ÂÂÃ£ÂÂÃ£ÂÂ®Ã¥Â¿ÂÃ§Â­ÂÃ£ÂÂÃ¤Â¸ÂÃ¦Â­Â£Ã£ÂÂ§Ã£ÂÂ');

    const responseText = claudeData.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`JSONÃ£ÂÂÃ¨Â¦ÂÃ£ÂÂ¤Ã£ÂÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ: ${responseText}`);

    const parsed = JSON.parse(jsonMatch[0]);

    // Ã£ÂÂÃ£ÂÂªÃ£ÂÂÃ£ÂÂ¼Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂ³
    if (!parsed.trade_date || typeof parsed.settlements !== 'number') {
      throw new Error('Ã£ÂÂÃ£ÂÂ¼Ã£ÂÂ¿Ã£ÂÂ®Ã¨Â§Â£Ã¦ÂÂÃ£ÂÂ«Ã¥Â¤Â±Ã¦ÂÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ');
    }

    // Ã¥ÂÂÃ§ÂÂÃ¨Â¨ÂÃ§Â®Â
    const winRate = parsed.settlements > 0
      ? Math.round((parsed.wins / parsed.settlements) * 1000) / 10
      : 0;

    // Ã£ÂÂ¹Ã£ÂÂ¯Ã£ÂÂªÃ£ÂÂ¼Ã£ÂÂ³Ã£ÂÂ·Ã£ÂÂ§Ã£ÂÂÃ£ÂÂÃ£ÂÂSupabase StorageÃ£ÂÂ«Ã£ÂÂ¢Ã£ÂÂÃ£ÂÂÃ£ÂÂ­Ã£ÂÂ¼Ã£ÂÂ
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

    // SupabaseÃ£ÂÂ«upsertÃ¯Â¼ÂÃ¥ÂÂÃ£ÂÂÃ¦ÂÂ¥Ã¤Â»ÂÃ£ÂÂªÃ£ÂÂÃ¤Â¸ÂÃ¦ÂÂ¸Ã£ÂÂÃ¯Â¼Â
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
      throw new Error(`SupabaseÃ¤Â¿ÂÃ¥Â­ÂÃ£ÂÂ¨Ã£ÂÂ©Ã£ÂÂ¼: ${err}`);
    }

    // Ã¦ÂÂÃ¥ÂÂÃ£ÂÂ¡Ã£ÂÂÃ£ÂÂ»Ã£ÂÂ¼Ã£ÂÂ¸
    const sign = parsed.pnl >= 0 ? '+' : '';
    const pnlFormatted = Math.abs(parsed.pnl).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const pnlStr = `${sign}ÃÂ¥${parsed.pnl < 0 ? '-' : ''}${pnlFormatted}`;

    await sendMessage(chatId,
      `Ã¢ÂÂ <b>${parsed.trade_date} Ã£ÂÂ®Ã¨Â¨ÂÃ©ÂÂ²Ã¥Â®ÂÃ¤ÂºÂÃ¯Â¼Â</b>\n\n` +
      `Ã°ÂÂÂ Ã¦Â±ÂºÃ¦Â¸ÂÃ¥ÂÂÃ¦ÂÂ°: <b>${parsed.settlements}Ã¥ÂÂ</b>\n` +
      `Ã°ÂÂÂ¢ Ã¥ÂÂÃ£ÂÂ¡: <b>${parsed.wins}Ã¥ÂÂ</b>\n` +
      `Ã°ÂÂÂ´ Ã¨Â²Â Ã£ÂÂ: <b>${parsed.losses}Ã¥ÂÂ</b>\n` +
      `Ã°ÂÂÂ Ã¥ÂÂÃ§ÂÂ: <b>${winRate}%</b>\n` +
      `Ã°ÂÂÂ´ Ã¦ÂÂÃ§ÂÂ: <b>${sign}ÃÂ¥${pnlFormatted}</b>`
    );

  } catch (error) {
    console.error('Error:', error);
    await sendMessage(chatId,
      `Ã¢ÂÂ Ã£ÂÂ¨Ã£ÂÂ©Ã£ÂÂ¼Ã£ÂÂÃ§ÂÂºÃ§ÂÂÃ£ÂÂÃ£ÂÂ¾Ã£ÂÂÃ£ÂÂ\n${error.message}\n\nÃ£ÂÂÃ£ÂÂÃ¤Â¸ÂÃ¥ÂºÂ¦Ã©ÂÂÃ£ÂÂ£Ã£ÂÂ¦Ã£ÂÂÃ£ÂÂ Ã£ÂÂÃ£ÂÂÃ£ÂÂ`
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

async function sendMessagePlain(chatId, text) {
  return fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
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
    return countHeader ? countHeader.split('/')[1] : 'Ã¤Â¸ÂÃ¦ÂÂ';
  } catch {
    return 'Ã¤Â¸ÂÃ¦ÂÂ';
  }
}
