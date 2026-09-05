import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";
import { buildEmailBody, buildEmailSubject, type NotificationChannel, type NotificationPayload } from "./types.js";

export function createEmailChannel(config: AppConfig): NotificationChannel {
  const transporter = config.emailEnabled
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASSWORD
            }
          : undefined
      })
    : null;

  return {
    name: "email",
    enabled: config.emailEnabled,
    async send(payload: NotificationPayload): Promise<void> {
      if (!transporter || !config.EMAIL_FROM || !config.ALERT_EMAIL) {
        throw new Error("Email is not configured");
      }
      await transporter.sendMail({
        from: config.EMAIL_FROM,
        to: config.ALERT_EMAIL,
        subject: buildEmailSubject(payload),
        text: buildEmailBody(payload)
      });
    }
  };
}
