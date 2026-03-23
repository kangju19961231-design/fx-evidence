// Telegram Bot Webhook — Vercel Serverless Function
// Flow: Telegram photo → Claude OCR → Supabase save → Reply

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
              text: `このMT5の約定履歴（約定タブ）スクリーンショットを解析して、以下のJSONのみ返してください。説明文は不要です。

{
  "trade_date": "YYYY-MM-DD",
  "settlements": <決済回数（"out"の取引数）>,
  "wins": <勝ち数（プラスのP&L取引数）>,
  "losses": <負け数（マイナスのP&L取引数）>,
  "pnl": <損益合計（画面上部の「損益:」の数値、スペースなしの数値）>
}

ルール：
- "out"（決済・クローズ）の取引のみカウント、"in"（エントリー）は除く
- "commission"（コミッション・手数料）の行は勝ち・負けのどちらにもカウントしない（settlementsにも含めない）
- trade_dateは画面内の取引日付（例: "2026.03.09" → "2026-03-09"）
- pnlは損益欄の数値をそのまま（例: "1 467.77" → 1467.77）
- JSONのみ、コードブロックも不要`
            }
          ]
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeData.content?.[0]?.text) {
      const apiErr = claudeData.error?.message || JSON.stringify(claudeData);
      throw new Error(`Claude API エラー: ${apiErr}`);
    }

    const responseText = claudeData.content[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`JSONが見つかりません: ${responseText}`);

    const parsed = JSON.parse(jsonMatch[0]);

    // バリデーション
    if (!parsed.trade_date || typeof parsed.settlements !== 'number') {
      throw new Error('データの解析に失敗しました');
    }

    // 同日の既存レコードを取得（複数枚スクリーンショット対応）
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/daily_records?trade_date=eq.${parsed.trade_date}&select=*`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY
        }
      }
    );
    const existingData = await existingRes.json();
    const existing = Array.isArray(existingData) ? existingData[0] : null;

    // 既存レコードがある場合は加算、なければそのまま
    let finalSettlements, finalWins, finalLosses, finalPnl;
    if (existing) {
      finalSettlements = existing.settlements + parsed.settlements;
      finalWins = existing.wins + parsed.wins;
      finalLosses = existing.losses + parsed.losses;
      finalPnl = Math.round((existing.pnl + parsed.pnl) * 100) / 100;
    } else {
      finalSettlements = parsed.settlements;
      finalWins = parsed.wins;
      finalLosses = parsed.losses;
      finalPnl = parsed.pnl;
    }

    // 勝率計算
    const winRate = finalSettlements > 0
      ? Math.round((finalWins / finalSettlements) * 1000) / 10
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

    // Supabaseにupsert（同じ日付なら加算済み値で上書き）
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
          settlements: finalSettlements,
          wins: finalWins,
          losses: finalLosses,
          pnl: finalPnl,
          screenshot_url: screenshotUrl
        })
      }
    );

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      throw new Error(`Supabase保存エラー: ${err}`);
    }

    // 成功メッセージ（2枚目以降は合計値を表示）
    const isAdditional = !!existing;
    const sign = finalPnl >= 0 ? '+' : '';
    const pnlFormatted = Math.abs(finalPnl).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    const pnlStr = `${sign}¥${pnlFormatted}`;

    await sendMessage(chatId,
      `✅ <b>${parsed.trade_date} の記録${isAdditional ? '追加' : '完了'}！</b>${isAdditional ? '（合計）' : ''}\n\n` +
      `📊 決済回数: <b>${finalSettlements}回</b>\n` +
      `🟢 勝ち: <b>${finalWins}回</b>\n` +
      `🔴 負け: <b>${finalLosses}回</b>\n` +
      `📈 勝率: <b>${winRate}%</b>\n` +
      `💴 損益: <b>${sign}¥${pnlFormatted}</b>`
    );

  } catch (error) {
    console.error('Error:', error);
    await sendMessagePlain(chatId, `ERROR: ${error.message}`);
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
    return countHeader ? countHeader.split('/')[1] : '不明';
  } catch {
    return '不明';
  }
}
