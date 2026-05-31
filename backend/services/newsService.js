export async function fetchTopNews() {
  try {
    console.log("[newsService] Buscando notícias do Brasil em tempo real...");
    const url = "https://saurav.tech/NewsAPI/top-headlines/category/general/br.json";
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao obter notícias. Status: ${response.status}`);
    }

    const data = await response.json();
    const articles = data.articles || [];

    // Retornar apenas as principais 8 notícias com dados essenciais e seguros
    return articles.slice(0, 8).map(art => ({
      title: art.title || "Notícia sem título",
      description: art.description || "Sem descrição disponível no momento.",
      url: art.url || "#",
      urlToImage: art.urlToImage || "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
      source: art.source?.name || "Portal de Notícias",
      publishedAt: art.publishedAt ? new Date(art.publishedAt).toLocaleDateString("pt-BR") : ""
    }));
  } catch (error) {
    console.error("[newsService] Erro ao buscar notícias:", error);
    // Retorno fallback caso a rede esteja instável ou offline
    return [
      {
        title: "Tecnologia e IA continuam avançando no Brasil e no mundo",
        description: "Estudos apontam que o uso de inteligência artificial de voz se multiplicou nas residências nos últimos anos.",
        url: "#",
        urlToImage: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
        source: "Inovação Diária",
        publishedAt: new Date().toLocaleDateString("pt-BR")
      },
      {
        title: "Dicas para aumentar sua produtividade com assistentes virtuais",
        description: "Aprenda a agendar reuniões, ouvir resumos do dia e criar rotinas eficientes de trabalho.",
        url: "#",
        urlToImage: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop",
        source: "Trabalho Inteligente",
        publishedAt: new Date().toLocaleDateString("pt-BR")
      }
    ];
  }
}
