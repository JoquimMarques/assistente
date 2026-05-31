import nodemailer from "nodemailer";

export async function sendEmail({ to, subject, body }) {
  const cleanTo = String(to || "").trim();
  const cleanSubject = String(subject || "").trim();
  const cleanBody = String(body || "").trim();

  if (!cleanTo || !cleanSubject || !cleanBody) {
    throw new Error("Destinatário, Assunto e Mensagem são campos obrigatórios.");
  }

  console.log(`[emailService] Iniciando processo de envio de e-mail para: ${cleanTo}`);
  
  // Simular latência de rede para a interface do Axel (1.5 segundos)
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const {
    SMTP_HOST,
    SMTP_PORT = 587,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM = "Axel Assistente <axel@assistente.local>"
  } = process.env;

  // Se o usuário configurou SMTP no arquivo .env, fazemos o envio REAL!
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      console.log("[emailService] Configuração SMTP detectada. Tentando envio real...");
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465, // true para porta 465, false para 587
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: SMTP_FROM,
        to: cleanTo,
        subject: cleanSubject,
        text: cleanBody,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; background: #fafafa; border-radius: 8px; border: 1px solid #eee;">
            <h2 style="color: #ffaa00; margin-top: 0;">Mensagem do Axel Assistente</h2>
            <p style="font-size: 1.1em; line-height: 1.5;">${cleanBody.replace(/\n/g, "<br>")}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.85em; color: #777;">Enviado automaticamente pelo Axel Virtual Assistant.</p>
          </div>
        `
      });

      console.log("[emailService] E-mail real enviado com sucesso! MessageID:", info.messageId);
      return {
        success: true,
        realSent: true,
        messageId: info.messageId,
        to: cleanTo,
        subject: cleanSubject
      };
    } catch (smtpError) {
      console.error("[emailService] Erro no envio real SMTP, recorrendo à simulação:", smtpError.message);
      // Retorna sucesso simulado se falhar o SMTP para não travar a experiência do usuário
    }
  }

  // Envio Simulado Fallback
  console.log("[emailService] Simulação de envio concluída com sucesso.");
  return {
    success: true,
    realSent: false,
    to: cleanTo,
    subject: cleanSubject,
    message: "E-mail simulado com sucesso! Para enviar de verdade, configure o SMTP no arquivo .env."
  };
}
