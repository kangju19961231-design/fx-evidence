/**
 * FX Evidence — Telegram Webhook
 * Vercel Serverless Function
 *
 * 受信したスクリーンショットを Supabase に保存し、
 * 公開サイトへ自動反映するハンドラ
 */

const { createClient } = require('@supabase/supabase-js');

// ---- Supabase クライアント (サービスキーで書き込み) ----
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // ← 書き込みにはサービスキーを使用
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// 任意: 送信を許可するTelegramのチャットIDをカンマ区切りで設定
// 例: "123456789,987654321"  ← 空の場合は全員許可
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---- Telegram API ヘルパー ----
async function tgSend(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

// ---- キャプションのパース (通貨ペア / P&L 抽出) ----
function parseCaption(caption = '') {
  // 通貨ペア: USDJPY / EUR/USD / GBP-JPY など
  const pairMatch = caption.match(/\b([A-Z]{3}[\/\-]?[A-Z]{3})\b/i);
  const currencyPair = pairMatch
    ? pairMatch[1].toUpperCase().replace(/[\/\-]/, '')
    : null;

  // P&L: +150pips / -200 / +$1500 / -¥3000 など
  const pnlMatch = caption.match(
    /([+\-]?\s*[\d,]+(?:\.\d+)?)\s*(pips?|USD|\$|円|JPY|ドル|¥|%)?/i
  );
  const profitLoss = pnlMatch ? pnlMatch[0].trim().replace(/\s+/, '') : null;

  return { currencyPair, profitLoss };
}

// ---- メインハンドラ ----
module.exports = async (req, res) => {
  // Telegram は常に POST を送る
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const update  = req.body || {};
  const message = update.message || update.channel_post;

  // メッセージがなければスキップ (ok を返すことでTelegramのリトライり防ぐ)
  if (!message) return res.status(200).json({ ok: true });

  const chatId = String(message.chat.id);

  // 送信者チェック (ALLOWED_CHAT_IDS が設定されている場合)
  if (ALLOWED.length > 0 && !ALLOWED.includes(chatId)) {
    return res.status(200).json({ ok: true });
  }

  // /start コマンド
  if (message.text === '/start') {
    await tgSend(
      chatId,
      '👋 <b>FX Evidence Bot</b> へようこそ！\n\n' +
      '📸 取引のスクリーンショットを送信すると\n' +
      '　  自動でサイトに登録されます。\n\n' +
      '💡 <b>キャプションの推奨フォーマット：</b>\n' +
      '<code>USDJPY +150pips</code>\n' +
      '<code>EUR/USD -30pips</code>\n' +
      '<code>GBPJPY +$500</code>\n\n' +
      '通貨ペアと損益を含めると自動解析されます✨'
    );
    return res.status(200).json({ ok: true });
  }

  // /delete コマンド (最後に登録した1件を削除)
  if (message.text && message.text.startsWith('/delete')) {
    const { data } = await supabase
      .from('trades')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      await supabase.from('trades').delete().eq('id', data[0].id);
      await tgSend(chatId, '🗑 直前に登録したエビデンスを削除しました。');
    } else {
      await tgSend(chatId, 'ℹ️ 削除できる記録が見つかりませんでした。');
    }
    return res.status(200).json({ ok: true });
  }

  // 写真でなければスキップ
  if (!message.photo || message.photo.length === 0) {
    return res.status(200).json({ ok: true });
  }

  try {
    // ---- 1. 最高解像度の写真を取得 ----
    const photo  = message.photo[message.photo.length - 1];
    const fileId = photo.file_id;
    const caption = message.caption || '';

    // ---- 2. Telegram から file_path を取得 ----
    const fRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fData = await fRes.json();
    if (!fData.ok) throw new Error('Telegram getFile failed: ' + JSON.stringify(fData));

    const filePath = fData.result.file_path;
    const ext      = filePath.split('.').pop() || 'jpg';

    // ---- 3. 画像をダウンロード ----
    const imgRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    );
    if (!imgRes.ok) throw new Error('Failed to download image from Telegram');
    const imgBuffer = await imgRes.arrayBuffer();

    // ---- 4. Supabase Storage にアップロード ----
    const now       = new Date();
    const yyyy      = now.getFullYear();
    const mm        = String(now.getMonth() + 1).padStart(2, '0');
    const dd        = String(now.getDate()).padStart(2, '0');
    const ts        = Date.now();
    const storagePath = `${yyyy}/${mm}/${dd}/${ts}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('evidence')
      .upload(storagePath, imgBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false,
      });
    if (upErr) throw upErr;

    // ---- 5. 公開 URL を取得 ----
    const { data: { publicUrl } } = supabase.storage
      .from('evidence')
      .getPublicUrl(storagePath);

    // ---- 6. キャプションをパース ----
    const { currencyPair, profitLoss } = parseCaption(caption);

    // ---- 7. DB に挿入 ----
    const { error: insErr } = await supabase.from('trades').insert({
      trade_date:          now.toISOString(),
      currency_pair:       currencyPair,
      profit_loss:         profitLoss,
      image_url:           publicUrl,
      caption:             caption || null,
      telegram_message_id: String(message.message_id),
    });
    if (insErr) throw insErr;

    // ---- 8. 登録完了を通知 ----
    const pairLine = currencyPair ? `\n💱 通貨ペア: <b>${currencyPair}</b>` : '';
    const pnlLine  = profitLoss   ? `\n💰 P&amp;L: <b>${profitLoss}</b>`    : '';
    const timeStr  = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    await tgSend(
      chatId,
      `✅ <b>エビデンスを登録しました！</b>\n` +
      `📅 ${timeStr}` +
      pairLine +
      pnlLine +
      `\n\n🔗 サイトで確認できます`
    );

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[FX Evidence] Error:', err);
    // エラーでも Telegram には 200 を返す (無限リトライ防止)
    await tgSend(chatId, `❌ エラーが発生しました。\n<code>${err.message}</code>`).catch(() => {});
    return res.status(200).json({ ok: true });
  }
};
