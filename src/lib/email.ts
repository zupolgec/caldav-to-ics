import { type Locale, t } from "./i18n";

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sends the one-time sign-in link. */
export async function sendLoginEmail(env: Env, to: string, link: string, locale: Locale, host: string): Promise<void> {
  const m = t(locale).auth.mail;
  const text = `${m.greeting}\n\n${m.body}\n\n${link}\n\n${m.validity}\n`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:32px 16px;background:#fbfbf8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1f3b">
<div style="max-width:480px;margin:0 auto">
<p style="font-size:20px;font-weight:800;margin:0 0 24px">calendario<span style="font-weight:500;color:#4a4f6e">.condividi.link</span></p>
<p style="font-size:16px;line-height:1.5;margin:0 0 8px">${escapeHtml(m.greeting)}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 24px">${escapeHtml(m.body)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1b1f3b;color:#fbfbf8;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px">${escapeHtml(m.button)}</a></p>
<p style="font-size:14px;line-height:1.5;color:#4a4f6e;margin:0 0 8px">${escapeHtml(m.validity)}</p>
<p style="font-size:12px;line-height:1.5;color:#4a4f6e;word-break:break-all;margin:24px 0 0">${escapeHtml(link)}</p>
</div></body></html>`;

  if (env.DEV_OUTBOX === "1") await env.FEEDS.put(`outbox:${to}`, text, { expirationTtl: 600 });
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM || `accesso@${host}`, name: "Calendario" },
    to,
    subject: m.subject,
    text,
    html,
  });
}
