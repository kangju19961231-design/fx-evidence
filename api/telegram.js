// Telegram Bot Webhook — Vercel Serverless Function
// Flow: Telegram photo → Claude OCR → Supabase save → Reply

export const config = { runtime: 'nodejs20.x' };

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

  // 許可されたユーザーのみ処理
  if (chatId !== ALLOWED_CHAT_ID) {
    return res.status(200).json({ ok: true });
  }

  // テキストコマンド処理
  if (message.text) {
    if (message.text === '/start' || message.text === '/help') {
      await sendMessage(chatId,
        '📸 <b>FX Evidence Bot</b>\n\n' +
        'MT5の約定履歴（約定タブ）のスクリーンショットを送ると自動で記録します。\n\n' +
        '1日1枚、1日分の取引をまとめたスクリーンショットを送ってください。'
      );
    } else if (message.text === '/status') {
      const count = await getRecordCount();
      await sendMessage(chatId, `📊 現在 ${count} 日分のデータが記録されています。`);
    }
    return res.status(200).json({ ok: true });
  }

  // 写真処理
  if (!message.photo) {
    await sendMessage(chatId, '📸 MT5の約定履歴のスクリーンショットを送ってください。');
    return res.status(200).json({ ok: true });
  }

  // 処理中メッセージ
  await sendMessage(chatId, '⏳ 読み取り中...');

  try {
    // 最高画質の写真を取得
    const photo = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;

    // TelegramからファイルURLを取得
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('ファイル情報の取得に失敗しました');

    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    // 画像をダウンロード
    const imageRes = await fetch(fileUrl);
    if (!imageRes.ok) throw new Error('画像のダウンロードに失敗しました');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Claude APIで画像解析
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
              text: `このMT5の約定履歴（約定タブ）スクリーンショットを解析して、以下はJSONのみ返してください。説明文は不要です。

{
  "trade_date": "YYYY-MM-DD",
  "settlements": <決済回数（"out"の取引数）>,
  "wins": <勝ち数（プラスはP&L取引数）>,
  "losses": <負け数（マイナスのP&L取引数）>,
  "pnl": <損益合計（画面上部の「損益:」の数値、スペースなしは数値）>
}

ルール：
- "out"（決済・クローズ）の取引のみカウント、"in"（エントリー）は除く
- trade_dateは画面内の取引日付（例: "2026.03.09" → "2026-03-09"）
- pnlは損益欄の数値をそのまま（例: "1 467.77" → 1467.77）
- JSONのみ、コードブロックも不要`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeData.content?.[0]?.text) throw new Error('Claude APIからの応答が不正です');

    const responseText = claudeData.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`JSONが見つかりません: ${responseText}`);

    const parsed = JSON.parse(jsonMatch[0]);

    // バリデーション
    if (!parsed.trade_date || typeof parsed.settlements !== 'number') {
      throw new Error('データの解析に失敗しました');
    }

    // 勝率計算
    const winRate = parsed.settlements > 0
      ? Math.round((parsed.wins / parsed.settlements) * 1000) / 10
      : 0;

    // スクリーンショットをSupabase Storageにアップロード
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

    // Supabaseにupsert（同じ日付なら上書き）
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
      throw new Error(`Supabase保存エラー: ${err}`);
    }

    // 成功メッセージ
    const sign = parsed.pnl >= 0 ? '+' : '';
    const pnlFormatted = Math.abs(parsed.pnl).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const pnlStr = `${sign}¥${parsed.pnl < 0 ? '-' : ''}${pnlFormatted}`;

    await sendMessage(chatId,
      `✅ <b>${parsed.trade_date} の記録完了！</b>\n\n` +
      `📊 決済回数: <b>${parsed.settlements}回</b>\n` +
      `🟢 勝ち: <b>${parsed.wins}回</b>\n` +
      `🔴 負け: <b>${parsed.losses}回</b>\n` +
      `📈 勝率: <b>${winRate}%</b>\n` +
      `💴 損益: <b>${sign}¥${pnlFormatted}</b>`
    );

  } catch (error) {
    console.error('Error:', error);
    await sendMessage(chatId,
      `❌ エラーが発生しました\n${error.message}\n\nもう一度送ってください。`
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
    return countHeader ? countHeader.split('/')[1] : '不明';
  } catch {
    return '不明';
  }
}
