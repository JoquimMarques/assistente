export async function askFreeAI(query, history = []) {
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
  
  IDIOMA: Português (PT-BR) fluído.`;

  // Construir a lista de mensagens incluindo o histórico
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: clean }
  ];

  const models = [
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)" },
    { id: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (Free)" }
  ];

  for (const modelInfo of models) {
    try {
      console.log(`[aiService] Chamando OpenRouter com modelo ${modelInfo.id}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://vercel.com", 
          "X-Title": "Axel Virtual Assistant"
        },
        body: JSON.stringify({
          model: modelInfo.id, 
          messages: messages,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[aiService] Erro com modelo ${modelInfo.id} (Status ${response.status}):`, errorText);
        continue;
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || "";

      if (!answer) {
        console.warn(`[aiService] Resposta vazia recebida do modelo ${modelInfo.id}`);
        continue;
      }

      console.log(`[aiService] Resposta recebida com sucesso usando ${modelInfo.name}`);
      return {
        answer,
        source: `${modelInfo.name} (via OpenRouter)`
      };
    } catch (error) {
      console.error(`[aiService] Erro na requisicao para o modelo ${modelInfo.id}:`, error);
      continue;
    }
  }

  return null;
}
