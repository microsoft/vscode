import { marked } from "marked";
import secureJSON from "secure-json-parse";
import { PearAITemplate, pearaiTemplateSchema, Prompt } from "./PearAITemplate";

export type PearAITemplateParseResult =
	| {
			type: "success";
			template: PearAITemplate;
	  }
	| {
			type: "error";
			error: unknown;
	  };

class NamedCodeSnippetMap {
	private readonly contentByLangInfo = new Map<string, string>();

	set(langInfo: string, content: string): void {
		this.contentByLangInfo.set(langInfo, content);
	}

	get(langInfo: string): string {
		const content = this.contentByLangInfo.get(langInfo);

		if (content == null) {
			throw new Error(`Code snippet for lang info '${langInfo}' not found.`);
		}

		return content;
	}

	resolveTemplate(prompt: Prompt, templateId: string) {
		prompt.template = this.getHandlebarsTemplate(templateId);
	}

	private getHandlebarsTemplate(templateName: string): string {
		return this.get(`template-${templateName}`).replace(/\\`\\`\\`/g, "```");
	}
}

export const extractNamedCodeSnippets = (
	content: string
): NamedCodeSnippetMap => {
	const codeSnippets = new NamedCodeSnippetMap();

	marked
		.lexer(content)
		.filter((token) => token.type === "code")
		.forEach((token) => {
			const codeToken = token as marked.Tokens.Code;
			if (codeToken.lang != null) {
				codeSnippets.set(codeToken.lang, codeToken.text);
			}
		});

	return codeSnippets;
};

export function parsePearAITemplateOrThrow(
	templateAsRdtMarkdown: string
): PearAITemplate {
	const parseResult = parsePearAITemplate(templateAsRdtMarkdown);

	if (parseResult.type === "error") {
		throw parseResult.error;
	}

	return parseResult.template;
}

export function parsePearAITemplate(
	templateAsRdtMarkdown: string
): PearAITemplateParseResult {
	try {
		const namedCodeSnippets = extractNamedCodeSnippets(templateAsRdtMarkdown);

		const templateText = namedCodeSnippets.get("json conversation-template");

		const template = pearaiTemplateSchema.parse(secureJSON.parse(templateText));

		if (template.initialMessage != null) {
			namedCodeSnippets.resolveTemplate(
				template.initialMessage as Prompt,
				"initial-message"
			);
		}

		namedCodeSnippets.resolveTemplate(template.response as Prompt, "response");

		return {
			type: "success",
			template: template as PearAITemplate,
		};
	} catch (error) {
		return {
			type: "error",
			error,
		};
	}
}
