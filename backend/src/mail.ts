import nodemailer, { type Transporter } from 'nodemailer';

const env = process.env;
let tx: Transporter | null | undefined;
function mailer() {
  if (tx !== undefined) return tx;
  const host = env.SMTP_HOST, user = env.SMTP_USER, pass = env.SMTP_PASS;
  if (!host || !user || !pass) return (tx = null);
  tx = nodemailer.createTransport({ host, port: Number(env.SMTP_PORT ?? 587), secure: env.SMTP_SECURE === 'true', auth: { user, pass } });
  return tx;
}
export const mailReady = () => !!mailer();
export async function sendCode(to: string, code: string, kind: 'reset' | 'signup') {
  const t = mailer(); if (!t) return false;
  const subject = kind === 'signup' ? 'URUMURI NEWS account reset OTP' : 'URUMURI NEWS password reset code';
  const text = `Your ${kind === 'signup' ? 'account reset OTP' : 'password reset code'} is: ${code}\n\nThis code expires in 30 minutes. If you did not request it, you can ignore this email.`;
  await t.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text });
  return true;
}
export async function sendMail(to: string, subject: string, text: string, attachment?: { filename: string; content: Buffer; contentType?: string }) {
  const t = mailer(); if (!t) return false;
  await t.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, text, attachments: attachment ? [attachment] : undefined });
  return true;
}
