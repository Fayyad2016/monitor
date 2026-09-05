import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";
import { resolveHostname } from "../net/dns.js";
import { logger } from "../logger.js";
import { describeError } from "../tls/errorInfo.js";
import type { NotificationChannel, NotificationPayload } from "./types.js";
import {
  buildEmailHtml,
  buildEmailSubject,
  buildEmailText,
  emailIdentityFromConfig,
  formatFromHeader,
  generateMessageId
} from "./emailTemplate.js";

export function createEmailChannel(config: AppConfig): NotificationChannel {
  return {
    name: "email",
    enabled: config.emailEnabled,
    async send(payload: NotificationPayload): Promise<void> {
      if (!config.emailEnabled || !config.SMTP_HOST || !config.EMAIL_FROM || !config.ALERT_EMAIL) {
        throw new Error("Email is not configured");
      }
      const identity = emailIdentityFromConfig(config);
      const resolved = await resolveHostname(config.SMTP_HOST);
      const tlsServername = config.SMTP_TLS_SERVERNAME?.trim() || resolved.host;
      logger.info(
        {
          smtpHostConfiguredLength: config.SMTP_HOST.length,
          smtpHost: resolved.host,
          smtpHostWarnings: resolved.warnings,
          smtpDns: resolved.addresses,
          smtpTlsServername: tlsServername,
          smtpPort: config.SMTP_PORT,
          smtpSecure: config.SMTP_SECURE,
          tlsVerify: config.TLS_REJECT_UNAUTHORIZED
        },
        "SMTP resolving host for send"
      );
      const transporter = nodemailer.createTransport({
        host: resolved.host,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        family: 4,
        disableFileAccess: true,
        disableUrlAccess: true,
        auth: config.SMTP_USER
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASSWORD
            }
          : undefined,
        tls: {
          servername: tlsServername,
          rejectUnauthorized: config.TLS_REJECT_UNAUTHORIZED,
          minVersion: "TLSv1.2"
        }
      } as nodemailer.TransportOptions);
      const sentAt = new Date();
      try {
        await transporter.sendMail({
          from: formatFromHeader(identity),
          replyTo: identity.replyTo,
          to: config.ALERT_EMAIL,
          date: sentAt,
          messageId: generateMessageId(identity, sentAt),
          subject: buildEmailSubject(payload),
          text: buildEmailText(payload, identity),
          html: buildEmailHtml(payload, identity),
          textEncoding: "quoted-printable"
        });
      } catch (error) {
        logger.error(
          {
            channel: "email",
            smtpHost: resolved.host,
            smtpTlsServername: tlsServername,
            smtpPort: config.SMTP_PORT,
            smtpDns: resolved.addresses,
            tlsVerify: config.TLS_REJECT_UNAUTHORIZED,
            err: describeError(error)
          },
          "SMTP send failed"
        );
        throw error;
      }
    }
  };
}
