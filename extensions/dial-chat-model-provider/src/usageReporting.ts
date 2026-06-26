import * as vscode from 'vscode';
import { dialLog } from './logger';
import { isRecord, type JsonObject } from './runtimeGuards';
import type { OpenAIStreamUsage } from './types';

/** True when the SSE stream had no text, tool_calls, or trailing usage chunk. */
export function isEmptyModelStream(
	counters: { readonly text: number; readonly tools: number },
	sawUsage: boolean,
): boolean {
	return counters.text === 0 && counters.tools === 0 && !sawUsage;
}

/** Parse OpenAI-compatible `usage` from a streaming or non-streaming chat completion JSON object. */
export function parseOpenAIStreamUsage(json: JsonObject): OpenAIStreamUsage | undefined {
	const usage = json.usage;
	if (!isRecord(usage)) {
		return undefined;
	}
	const prompt = usage.prompt_tokens;
	const completion = usage.completion_tokens;
	if (typeof prompt !== 'number' || typeof completion !== 'number') {
		return undefined;
	}
	const total = usage.total_tokens;
	const details = usage.prompt_tokens_details;
	const cached =
		isRecord(details) && typeof details.cached_tokens === 'number'
			? details.cached_tokens
			: undefined;
	return {
		prompt_tokens: prompt,
		completion_tokens: completion,
		...(typeof total === 'number' ? { total_tokens: total } : {}),
		...(cached !== undefined ? { prompt_tokens_details: { cached_tokens: cached } } : {}),
	};
}

/**
 * Report token usage to VS Code Chat.
 * Prefers {@link vscode.LanguageModelUsagePart} when available; falls back to the legacy `usage` data part mime type.
 */
export function reportStreamUsage(
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	usage: OpenAIStreamUsage,
): void {
	const payload = {
		prompt_tokens: usage.prompt_tokens,
		completion_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens,
		...(usage.prompt_tokens_details !== undefined
			? { prompt_tokens_details: usage.prompt_tokens_details }
			: {}),
	};

	const UsageCtor = (
		vscode as unknown as {
			LanguageModelUsagePart?: {
				fromOpenAICompatible: (u: typeof payload) => vscode.LanguageModelResponsePart;
			};
		}
	).LanguageModelUsagePart;

	if (UsageCtor?.fromOpenAICompatible) {
		const part = UsageCtor.fromOpenAICompatible(payload);
		progress.report(part);
		dialLog.info('reportStreamUsage → LanguageModelUsagePart', payload);
		return;
	}

	progress.report(
		new vscode.LanguageModelDataPart(
			new TextEncoder().encode(JSON.stringify(payload)),
			'usage',
		),
	);
	dialLog.warn(
		'reportStreamUsage → legacy LanguageModelDataPart (mime=usage); rebuild VS Code with LanguageModelUsagePart for full Chat UI support',
		payload,
	);
}
