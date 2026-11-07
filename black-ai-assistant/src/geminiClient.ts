import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiClient {
  private model: any;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Gemini API key is missing. Set blackAiAssistant.apiKey first.");
    }

    const client = new GoogleGenerativeAI(apiKey);
    this.model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async ask(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      throw new Error(
        `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
