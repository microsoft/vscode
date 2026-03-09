import {
	Walkthrough,
	WalkthroughGenerateRequest,
	WalkthroughRenderOptions,
	FileChangeSummary,
} from './types.js';

export interface WalkthroughGeneratorOptions {
	modelRouterUrl: string;
}

export class WalkthroughGenerator {
	private readonly modelRouterUrl: string;

	constructor(options: WalkthroughGeneratorOptions) {
		this.modelRouterUrl = options.modelRouterUrl;
	}

	async generate(request: WalkthroughGenerateRequest): Promise<Walkthrough> {
		const systemPrompt = this.buildSystemPrompt();
		const userPrompt = this.buildUserPrompt(request);

		const response = await fetch(`${this.modelRouterUrl}/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Agent-Role': 'review-agent',
				'X-Task-Type': 'walkthrough-generation',
			},
			body: JSON.stringify({
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }],
			}),
		});

		if (!response.ok) {
			throw new Error(`Model router returned ${response.status}: ${await response.text()}`);
		}

		const result = await response.json() as Record<string, unknown>;
		return this.parseResponse(result, request);
	}

	render(walkthrough: Walkthrough, options: WalkthroughRenderOptions): string {
		switch (options.format) {
			case 'text':
				return this.renderText(walkthrough);
			case 'markdown':
				return this.renderMarkdown(walkthrough);
			case 'json':
				return JSON.stringify(walkthrough, null, 2);
			default:
				throw new Error(`Unknown format: ${options.format}`);
		}
	}

	buildSystemPrompt(): string {
		return [
			'You are a code walkthrough generator for the Son-Of-Anton AI code editor.',
			'Given a task description, code diff, graph context, and spec references,',
			'produce a structured walkthrough explaining the decisions made.',
			'',
			'Return a JSON object with this exact structure:',
			'{',
			'  "summary": "A concise summary of what was done and why",',
			'  "decisions": [',
			'    {',
			'      "what": "What was decided",',
			'      "why": "Why this approach was chosen",',
			'      "alternatives": ["Alternative approaches considered"],',
			'      "source": "What informed this decision (spec, graph, convention)"',
			'    }',
			'  ],',
			'  "filesChanged": [',
			'    {',
			'      "path": "relative/file/path",',
			'      "action": "create|modify|delete",',
			'      "description": "What changed in this file",',
			'      "linesAdded": 0,',
			'      "linesRemoved": 0',
			'    }',
			'  ],',
			'  "specsReferenced": ["List of specs or standards referenced"],',
			'  "graphContext": ["Graph queries or relationships used"],',
			'  "risksAndTradeoffs": ["Risks and tradeoffs of the approach"],',
			'  "confidence": "high|medium|low"',
			'}',
			'',
			'Return ONLY valid JSON. No markdown fences, no extra text.',
		].join('\n');
	}

	buildUserPrompt(request: WalkthroughGenerateRequest): string {
		const sections: string[] = [];

		sections.push(`## Task\n${request.taskDescription}`);
		sections.push(`## Specialist\n${request.specialist}`);
		sections.push(`## Diff\n\`\`\`\n${request.diff}\n\`\`\``);

		if (request.graphQueries && request.graphQueries.length > 0) {
			sections.push(`## Graph Queries\n${request.graphQueries.join('\n')}`);
		}

		if (request.specReferences && request.specReferences.length > 0) {
			sections.push(`## Spec References\n${request.specReferences.join('\n')}`);
		}

		if (request.traceData) {
			sections.push(`## Trace Data\n${request.traceData}`);
		}

		return sections.join('\n\n');
	}

	private parseResponse(result: Record<string, unknown>, request: WalkthroughGenerateRequest): Walkthrough {
		let content = '';

		// Extract text content from the model router response
		if (result.content && Array.isArray(result.content)) {
			const textBlock = (result.content as Array<{ type: string; text?: string }>)
				.find(block => block.type === 'text');
			if (textBlock?.text) {
				content = textBlock.text;
			}
		} else if (typeof result.text === 'string') {
			content = result.text;
		} else if (typeof result.content === 'string') {
			content = result.content;
		}

		try {
			// Strip markdown fences if present
			const jsonContent = content
				.replace(/^```json?\s*/m, '')
				.replace(/```\s*$/m, '')
				.trim();

			const parsed = JSON.parse(jsonContent) as Partial<Walkthrough>;

			return {
				taskId: request.taskId,
				specialist: request.specialist,
				summary: parsed.summary ?? 'No summary available',
				decisions: parsed.decisions ?? [],
				filesChanged: parsed.filesChanged ?? [],
				specsReferenced: parsed.specsReferenced ?? [],
				graphContext: parsed.graphContext ?? [],
				risksAndTradeoffs: parsed.risksAndTradeoffs ?? [],
				confidence: parsed.confidence ?? 'low',
				generatedAt: Date.now(),
			};
		} catch {
			// Best-effort parsing for unstructured text
			return {
				taskId: request.taskId,
				specialist: request.specialist,
				summary: content || 'Failed to parse LLM response',
				decisions: [],
				filesChanged: [],
				specsReferenced: request.specReferences ?? [],
				graphContext: request.graphQueries ?? [],
				risksAndTradeoffs: [],
				confidence: 'low',
				generatedAt: Date.now(),
			};
		}
	}

	private renderText(walkthrough: Walkthrough): string {
		const lines: string[] = [];

		lines.push('━━━ WALKTHROUGH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		lines.push('');
		lines.push(walkthrough.summary);
		lines.push('');

		if (walkthrough.decisions.length > 0) {
			lines.push('DECISIONS');
			lines.push('');
			walkthrough.decisions.forEach((decision, index) => {
				lines.push(`  ${index + 1}. ${decision.what}`);
				lines.push(`     Why: ${decision.why}`);
				if (decision.alternatives.length > 0) {
					lines.push(`     Alternative considered: ${decision.alternatives.join(', ')}`);
				}
				lines.push(`     Source: ${decision.source}`);
				lines.push('');
			});
		}

		if (walkthrough.filesChanged.length > 0) {
			lines.push('FILES CHANGED');
			walkthrough.filesChanged.forEach(file => {
				const prefix = this.getFileChangePrefix(file);
				lines.push(`  ${prefix} ${file.path} (${this.getFileChangeStats(file)}) — ${file.description}`);
			});
			lines.push('');
		}

		if (walkthrough.specsReferenced.length > 0) {
			lines.push('SPECS REFERENCED');
			walkthrough.specsReferenced.forEach(spec => {
				lines.push(`  ${spec}`);
			});
			lines.push('');
		}

		if (walkthrough.risksAndTradeoffs.length > 0) {
			lines.push('RISKS');
			walkthrough.risksAndTradeoffs.forEach(risk => {
				lines.push(`  • ${risk}`);
			});
			lines.push('');
		}

		lines.push(`CONFIDENCE: ${walkthrough.confidence}`);
		lines.push('');
		lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

		return lines.join('\n');
	}

	private renderMarkdown(walkthrough: Walkthrough): string {
		const lines: string[] = [];

		lines.push('# Walkthrough');
		lines.push('');
		lines.push(walkthrough.summary);
		lines.push('');

		if (walkthrough.decisions.length > 0) {
			lines.push('## Decisions');
			lines.push('');
			walkthrough.decisions.forEach((decision, index) => {
				lines.push(`### ${index + 1}. ${decision.what}`);
				lines.push('');
				lines.push(`**Why:** ${decision.why}`);
				lines.push('');
				if (decision.alternatives.length > 0) {
					lines.push(`**Alternatives considered:** ${decision.alternatives.join(', ')}`);
					lines.push('');
				}
				lines.push(`**Source:** ${decision.source}`);
				lines.push('');
			});
		}

		if (walkthrough.filesChanged.length > 0) {
			lines.push('## Files Changed');
			lines.push('');
			lines.push('| Action | Path | Changes | Description |');
			lines.push('|--------|------|---------|-------------|');
			walkthrough.filesChanged.forEach(file => {
				const action = file.action === 'create' ? 'Add' : file.action === 'modify' ? 'Modify' : 'Delete';
				lines.push(`| ${action} | \`${file.path}\` | ${this.getFileChangeStats(file)} | ${file.description} |`);
			});
			lines.push('');
		}

		if (walkthrough.specsReferenced.length > 0) {
			lines.push('## Specs Referenced');
			lines.push('');
			walkthrough.specsReferenced.forEach(spec => {
				lines.push(`- ${spec}`);
			});
			lines.push('');
		}

		if (walkthrough.risksAndTradeoffs.length > 0) {
			lines.push('## Risks and Tradeoffs');
			lines.push('');
			walkthrough.risksAndTradeoffs.forEach(risk => {
				lines.push(`- ${risk}`);
			});
			lines.push('');
		}

		lines.push(`**Confidence:** ${walkthrough.confidence}`);

		return lines.join('\n');
	}

	private getFileChangePrefix(file: FileChangeSummary): string {
		switch (file.action) {
			case 'create': return '+';
			case 'modify': return '~';
			case 'delete': return '-';
		}
	}

	private getFileChangeStats(file: FileChangeSummary): string {
		switch (file.action) {
			case 'create':
				return `${file.linesAdded} lines`;
			case 'modify':
				return `+${file.linesAdded}/-${file.linesRemoved} lines`;
			case 'delete':
				return `${file.linesRemoved} lines`;
		}
	}
}
