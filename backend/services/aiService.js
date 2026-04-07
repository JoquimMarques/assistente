export async function askFreeAI(query) {
  const clean = String(query || "").trim();
  if (!clean) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[aiService] OPENROUTER_API_KEY nao configurada.");
    return null;
  }

  const systemPrompt = `Você é o Axel, um assistente digital de alto desempenho.
  Sua personalidade é inspirada na Alexa: extremamente direta, eficiente e concisa.
  
  REGRAS DE RESPOSTA:
  1. Responda apenas o que foi perguntado. Evite preâmbulos como "Com certeza" ou "Aqui está...".
  2. Seja extremamente conciso. Use no máximo 2 ou 3 frases curtas.
  3. Use **Negrito** apenas para os dados principais da resposta.
  4. NUNCA use emojis.
  5. Se a pergunta for um fato, dê o fato diretamente. Exemplo: "O presidente da França é o Emmanuel Macron."
  
  INTERFACE: Você é parte do sistema Warm Tech (Premium).
  IDIOMA: Português constante e natural.`;

  try {
    console.log("[aiService] Chamando OpenRouter para:", clean);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Axel Virtual Assistant"
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5", // Modelo estável e comum
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
