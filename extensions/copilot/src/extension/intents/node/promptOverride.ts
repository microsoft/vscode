/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import * as yaml from 'js-yaml';
import type { LanguageModelToolInformation, Uri } from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { URI } from '../../../util/vs/base/common/uri';

interface PromptOverrideConfig {
	readonly systemPrompt?: string;
	readonly toolDescriptions?: Record<string, { readonly description: string }>;
}

interface PromptOverrideResult {
	readonly messages: Raw.ChatMessage[];
	readonly tools: LanguageModelToolInformation[];
}

const INLINE_PROMPT_OVERRIDE_SOURCE = 'inlinePromptOverrideString';

/** Tracks which override sources have already had a warning logged, to avoid spamming. */
const warnedSources = new Set<string>();

export async function applyConfiguredPromptOverrides(
	inlinePromptOverride: string | null,
	promptOverrideFile: string | null,
	messages: readonly Raw.ChatMessage[],
	tools: readonly LanguageModelToolInformation[],
	fileSystemService: IFileSystemService,
	logService: ILogService,
): Promise<PromptOverrideResult> {
	const normalizedInlinePromptOverride = inlinePromptOverride?.trim();
	const normalizedPromptOverrideFile = promptOverrideFile?.trim();

	if (normalizedInlinePromptOverride) {
		if (normalizedPromptOverrideFile) {
			logService.trace('[PromptOverride] Both inline prompt override text and prompt override file are configured; using inline prompt override text');
		}

		return applyPromptOverridesFromString(normalizedInlinePromptOverride, messages, tools, logService);
	}

	if (normalizedPromptOverrideFile) {
		return applyPromptOverrides(URI.file(normalizedPromptOverrideFile), messages, tools, fileSystemService, logService);
	}

	return clonePromptOverrideResult(messages, tools);
}

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
): Promise<PromptOverrideResult> {
	const key = fileUri.toString();
	let content: string;
	try {
		const buffer = await fileSystemService.readFile(fileUri);
		content = new TextDecoder().decode(buffer);
	} catch (err) {
		logPromptOverrideFailure(logService, key, `Failed to read prompt override file "${key}"`, err);
		return clonePromptOverrideResult(messages, tools);
	}

	const config = parsePromptOverrideConfig(content, key, `prompt override file "${key}"`, logService);
	if (!config) {
		return clonePromptOverrideResult(messages, tools);
	}

	return applyPromptOverrideConfig(config, messages, tools, logService);
}


export function applyPromptOverridesFromString(
	content: string,
	messages: readonly Raw.ChatMessage[],
	tools: readonly LanguageModelToolInformation[],
	logService: ILogService,
): PromptOverrideResult {
	const config = parsePromptOverrideConfig(content, INLINE_PROMPT_OVERRIDE_SOURCE, `inline prompt override setting "${INLINE_PROMPT_OVERRIDE_SOURCE}"`, logService);
	if (!config) {
		return clonePromptOverrideResult(messages, tools);
	}

	return applyPromptOverrideConfig(config, messages, tools, logService);
}

function parsePromptOverrideConfig(
	content: string,
	sourceKey: string,
	sourceDescription: string,
	logService: ILogService,
): PromptOverrideConfig | undefined {
	let config: PromptOverrideConfig;
	try {
		config = yaml.load(content) as PromptOverrideConfig;
	} catch (err) {
		logPromptOverrideFailure(logService, sourceKey, `Failed to parse prompt override from ${sourceDescription}`, err);
		return undefined;
	}

	// On successful parsing, clear any previous warning so a new error is re-surfaced as warn.
	warnedSources.delete(sourceKey);

	if (!config || typeof config !== 'object') {
		return undefined;
	}

	return config;
}

function applyPromptOverrideConfig(
	config: PromptOverrideConfig,
	messages: readonly Raw.ChatMessage[],
	tools: readonly LanguageModelToolInformation[],
	logService: ILogService,
): PromptOverrideResult {
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

function clonePromptOverrideResult(
	messages: readonly Raw.ChatMessage[],
	tools: readonly LanguageModelToolInformation[],
): PromptOverrideResult {
	return { messages: [...messages], tools: [...tools] };
}

function logPromptOverrideFailure(logService: ILogService, sourceKey: string, message: string, err: unknown): void {
	if (!warnedSources.has(sourceKey)) {
		warnedSources.add(sourceKey);
		logService.warn(`[PromptOverride] ${message}: ${err}`);
	} else {
		logService.trace(`[PromptOverride] ${message}: ${err}`);
	}
}

/**
 * Resets the internal warning deduplication state.
 * Exported for testing only.
 */
export function resetPromptOverrideWarnings(): void {
	warnedSources.clear();
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
