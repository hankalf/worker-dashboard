import nodemailer from "nodemailer";

type Attachment = { filename: string; content: string | Buffer };

// Sends mail over SMTP — defaults to Gmail. With a Gmail address + App Password
// (SMTP_USER / SMTP_PASS) this keeps everything in your own account, no
// third-party email service. Any other SMTP host works too via SMTP_HOST/PORT.
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error("SMTP_USER / SMTP_PASS are not set");

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.REPORT_FROM || user,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
}

// True when SMTP credentials are configured.
export function emailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}
