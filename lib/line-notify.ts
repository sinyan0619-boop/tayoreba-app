export async function pushLineNotify(message: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_ACCESS_TOKEN;
  const to    = process.env.LINE_NOTIFY_TO;
  if (!token || !to) return;

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: message }],
    }),
  }).catch((e) => console.error('LINE notify error:', e));
}
