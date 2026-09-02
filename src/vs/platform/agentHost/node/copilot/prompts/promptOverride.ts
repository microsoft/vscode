/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool } from '@github/copilot-sdk';
import { URI } from '../../../../../base/common/uri.js';
import { parse as parseYaml, type YamlMapNode, type YamlNode, type YamlParseError } from '../../../../../base/common/yaml.js';
import type { IFileService } from '../../../../files/common/files.js';
import type { ILogService } from '../../../../log/common/log.js';

interface IPromptOverrideConfig {
	readonly systemPrompt?: string;
	readonly toolDescriptions?: Readonly<Record<string, { readonly description: string }>>;
}

export interface IPromptOverrideResult {
	readonly systemPrompt?: string;
	readonly tools: Tool[];
}

const INLINE_PROMPT_OVERRIDE_SOURCE = 'inlinePromptOverrideString';
const warnedSources = new Set<string>();

export async function applyConfiguredPromptOverrides(
	inlinePromptOverride: string | undefined,
	promptOverrideFile: string | undefined,
	tools: readonly Tool[],
	fileService: IFileService,
	logService: ILogService,
): Promise<IPromptOverrideResult> {
	const normalizedInlinePromptOverride = inlinePromptOverride?.trim();
	const normalizedPromptOverrideFile = promptOverrideFile?.trim();

	if (normalizedInlinePromptOverride) {
		if (normalizedPromptOverrideFile) {
			logService.trace('[PromptOverride] Both inline prompt override text and prompt override file are configured; using inline prompt override text');
		}
		return applyPromptOverridesFromString(normalizedInlinePromptOverride, tools, logService);
	}

	if (!normalizedPromptOverrideFile) {
		return { tools: [...tools] };
	}

	const source = URI.file(normalizedPromptOverrideFile);
	let content: string;
	try {
		content = (await fileService.readFile(source)).value.toString();
	} catch (error) {
		logPromptOverrideFailure(logService, source.toString(), `Failed to read prompt override file "${source.toString()}"`, error);
		return { tools: [...tools] };
	}
	return applyPromptOverridesFromString(content, tools, logService, source.toString());
}

export function applyPromptOverridesFromString(
	content: string,
	tools: readonly Tool[],
	logService: ILogService,
	source = INLINE_PROMPT_OVERRIDE_SOURCE,
): IPromptOverrideResult {
	const config = parsePromptOverrideConfig(content, source, logService);
	if (!config) {
		return { tools: [...tools] };
	}

	if (config.systemPrompt !== undefined) {
		logService.trace('[PromptOverride] Applied system prompt override');
	}
	const overriddenTools = tools.map(tool => {
		const description = config.toolDescriptions?.[tool.name]?.description;
		return description === undefined ? tool : { ...tool, description };
	});
	if (config.toolDescriptions) {
		logService.trace('[PromptOverride] Applied tool description overrides');
	}
	return {
		...(config.systemPrompt !== undefined ? { systemPrompt: config.systemPrompt } : {}),
		tools: overriddenTools,
	};
}

function parsePromptOverrideConfig(content: string, source: string, logService: ILogService): IPromptOverrideConfig | undefined {
	const errors: YamlParseError[] = [];
	const document = parseYaml(content.replace(/^\uFEFF/, ''), errors);
	const fatalError = errors.find(error => error.code !== 'missing-value');
	if (fatalError) {
		logPromptOverrideFailure(logService, source, `Failed to parse prompt override from "${source}"`, fatalError.message);
		return undefined;
	}
	warnedSources.delete(source);
	if (document?.type !== 'map') {
		return undefined;
	}

	const systemPrompt = getStringProperty(document, 'systemPrompt');
	const toolDescriptionsNode = getProperty(document, 'toolDescriptions');
	const toolDescriptions: Record<string, { description: string }> = {};
	if (toolDescriptionsNode?.type === 'map') {
		for (const toolProperty of toolDescriptionsNode.properties) {
			if (toolProperty.value.type !== 'map') {
				continue;
			}
			const description = getStringProperty(toolProperty.value, 'description');
			if (description !== undefined) {
				toolDescriptions[toolProperty.key.value] = { description };
			}
		}
	}
	return {
		...(systemPrompt !== undefined ? { systemPrompt } : {}),
		...(toolDescriptionsNode?.type === 'map' ? { toolDescriptions } : {}),
	};
}

function getProperty(map: YamlMapNode, name: string): YamlNode | undefined {
	return map.properties.find(property => property.key.value === name)?.value;
}

function getStringProperty(map: YamlMapNode, name: string): string | undefined {
	const value = getProperty(map, name);
	return value?.type === 'scalar' && value.value.length > 0 ? value.value : undefined;
}

function logPromptOverrideFailure(logService: ILogService, source: string, message: string, error: unknown): void {
	if (warnedSources.has(source)) {
		logService.trace(`[PromptOverride] ${message}: ${error}`);
	} else {
		warnedSources.add(source);
		logService.warn(`[PromptOverride] ${message}: ${error}`);
	}
}
