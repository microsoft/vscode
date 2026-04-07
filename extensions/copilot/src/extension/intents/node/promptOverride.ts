/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import * as yaml from 'js-yaml';
import type { LanguageModelToolInformation, Uri } from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';

interface PromptOverrideConfig {
	readonly systemPrompt?: string;
	readonly toolDescriptions?: Record<string, { readonly description: string }>;
}

/** Tracks which file URIs have already had a warning logged, to avoid spamming. */
const warnedFiles = new Set<string>();

/**
 * Applies debug prompt overrides from a YAML file.
 * Reads the file via IFileSystemService, parses it, and applies system prompt and/or tool description overrides.
 * Warnings for unreadable/unparseable files are logged once per file path.
 */
export async function applyPromptOverrides(
	fileUri: Uri,
	messages: readonly Raw.ChatMessage[],
	tools: readonly LanguageModelToolInformation[],
	fileSystemService: IFileSystemService,
	logService: ILogService,
): Promise<{ messages: Raw.ChatMessage[]; tools: LanguageModelToolInformation[] }> {
	let config: PromptOverrideConfig;
	try {
		const buffer = await fileSystemService.readFile(fileUri);
		const content = new TextDecoder().decode(buffer);
		config = yaml.load(content) as PromptOverrideConfig;
	} catch (err) {
		const key = fileUri.toString();
		if (!warnedFiles.has(key)) {
			warnedFiles.add(key);
			logService.warn(`[PromptOverride] Failed to read or parse YAML file "${key}": ${err}`);
		} else {
			logService.trace(`[PromptOverride] Failed to read or parse YAML file "${key}": ${err}`);
		}
		return { messages: [...messages], tools: [...tools] };
	}

	// On successful read, clear any previous warning so a new error is re-surfaced as warn
	warnedFiles.delete(fileUri.toString());

	if (!config || typeof config !== 'object') {
		return { messages: [...messages], tools: [...tools] };
	}

	let resultMessages = [...messages];
	let resultTools = [...tools];

	if (typeof config.systemPrompt === 'string') {
		resultMessages = applySystemPromptOverride(resultMessages, config.systemPrompt);
		logService.trace('[PromptOverride] Applied system prompt override');
	}

	if (config.toolDescriptions && typeof config.toolDescriptions === 'object') {
		resultTools = applyToolDescriptionOverrides(resultTools, config.toolDescriptions);
		logService.trace('[PromptOverride] Applied tool description overrides');
	}

	return { messages: resultMessages, tools: resultTools };
}

/**
 * Resets the internal warning deduplication state.
 * Exported for testing only.
 */
export function resetPromptOverrideWarnings(): void {
	warnedFiles.clear();
}

function applySystemPromptOverride(messages: Raw.ChatMessage[], systemPrompt: string): Raw.ChatMessage[] {
	const nonSystemMessages = messages.filter(m => m.role !== Raw.ChatRole.System);
	return [
		{
			role: Raw.ChatRole.System,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: systemPrompt }],
		},
		...nonSystemMessages,
	];
}

function applyToolDescriptionOverrides(
	tools: readonly LanguageModelToolInformation[],
	overrides: Record<string, { readonly description: string }>,
): LanguageModelToolInformation[] {
	return tools.map(tool => {
		const override = overrides[tool.name];
		if (override && typeof override.description === 'string') {
			return { ...tool, description: override.description };
		}
		return tool;
	});
}
