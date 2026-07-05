type Attachment = { filename: string; content: string }; // content = base64

// Sends an email via the Resend HTTP API (no SDK dependency). Requires
// RESEND_API_KEY; the sender defaults to Resend's shared onboarding address,
// which can deliver to your own Resend account email without a verified domain.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from =
    process.env.REPORT_FROM || "Warehouse Dashboard <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      attachments: opts.attachments,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}
