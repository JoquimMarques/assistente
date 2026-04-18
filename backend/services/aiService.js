export async function askFreeAI(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[aiService] ERRO: OPENROUTER_API_KEY não encontrada no servidor.");
    console.log("[aiService] Verifique suas variáveis de ambiente no Render ou no seu arquivo .env local.");
    return null;
  }

  const systemPrompt = `Você é o Axel, um assistente inteligente, prestativo e natural.
  Sua personalidade é moderna, eficiente e agradável.
  
  REGRAS DE RESPOSTA:
  1. Responda de forma direta, mas mantenha um tom conversacional natural.
  2. Seja conciso, mas informativo. Use entre 2 a 4 frases, dependendo da complexidade.
  3. Use **Negrito** para destacar informações cruciais.
  4. NUNCA use emojis.
  5. Forneça fatos com clareza e autoridade.
  
  INTERFACE: Sistema Axel Premium.
  IDIOMA: Português (PT-BR) fluído.`;

  try {
    console.log("[aiService] Chamando OpenRouter para:", clean);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vercel.com", // Requisito do OpenRouter para alguns modelos
        "X-Title": "Axel Virtual Assistant"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001", // Modelo mais rápido e moderno disponível no OpenRouter
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: clean }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[aiService] Erro OpenRouter Status:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("[aiService] Resposta recebida do OpenRouter");
    const answer = data.choices?.[0]?.message?.content || "";

    if (!answer) return null;

    return {
      answer,
      source: "Gemini AI (via OpenRouter)"
    };
  } catch (error) {
    console.error("[aiService] Erro na requisicao:", error);
    return null;
  }
}
