import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
	private genAI: GoogleGenerativeAI;
	private model: any;

	constructor() {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY environment variable is not set');
		}

		this.genAI = new GoogleGenerativeAI(apiKey);
		this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
	}

	async explainCode(code: string): Promise<string> {
		const prompt = `Explain the following code in detail. Include what it does, how it works, and any important concepts:

\`\`\`
${code}
\`\`\`

Provide a clear, comprehensive explanation.`;

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		return response.text();
	}

	async generateCode(description: string, language: string): Promise<string> {
		const prompt = `Generate ${language} code based on this description: ${description}

Only provide the code without explanations. Make sure the code is complete and functional.`;

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		let text = response.text();
		
		// Remove markdown code blocks if present
		text = text.replace(/```[\w]*\n/g, '').replace(/```$/g, '').trim();
		
		return text;
	}

	async fixCode(code: string, language: string): Promise<string> {
		const prompt = `Fix any bugs, errors, or issues in the following ${language} code. Return only the fixed code without explanations:

\`\`\`${language}
${code}
\`\`\``;

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		let text = response.text();
		
		// Remove markdown code blocks if present
		text = text.replace(/```[\w]*\n/g, '').replace(/```$/g, '').trim();
		
		return text;
	}

	async refactorCode(code: string, language: string): Promise<string> {
		const prompt = `Refactor the following ${language} code to improve readability, performance, and maintainability. Follow best practices. Return only the refactored code without explanations:

\`\`\`${language}
${code}
\`\`\``;

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		let text = response.text();
		
		// Remove markdown code blocks if present
		text = text.replace(/```[\w]*\n/g, '').replace(/```$/g, '').trim();
		
		return text;
	}

	async addComments(code: string, language: string): Promise<string> {
		const prompt = `Add comprehensive comments to the following ${language} code. Explain what each section does. Return the code with comments added:

\`\`\`${language}
${code}
\`\`\``;

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		let text = response.text();
		
		// Remove markdown code blocks if present
		text = text.replace(/```[\w]*\n/g, '').replace(/```$/g, '').trim();
		
		return text;
	}

	async chat(message: string, context?: string): Promise<string> {
		let prompt = message;
		
		if (context) {
			prompt = `Context:\n${context}\n\nUser: ${message}`;
		}

		const result = await this.model.generateContent(prompt);
		const response = await result.response;
		return response.text();
	}
}
