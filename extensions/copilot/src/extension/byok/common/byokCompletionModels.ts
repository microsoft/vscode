/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { Emitter, Event } from '../../../util/vs/base/common/event';

/**
 * Vendors whose `chatLanguageModels.json` groups can back inline code completions
 * via OpenAI-compatible FIM endpoints.
 */
export const BYOK_COMPLETION_VENDORS = ['customendpoint', 'customoai'];

/**
 * A custom OpenAI-compatible model usable for inline code completions (FIM).
 * The FIM request is POSTed verbatim to {@link ByokCompletionModel.completionsUrl}.
 */
export interface ByokCompletionModel {
	/** Identifier usable in `github.copilot.selectedCompletionModel`. */
	readonly id: string;
	/** Display name for the model picker. */
	readonly label: string;
	/** Vendor id ('customendpoint' | 'customoai'). */
	readonly vendor: string;
	/** The chatLanguageModels.json group name the model comes from. */
	readonly groupName: string;
	/** Full URL the FIM request is POSTed to. Used verbatim — no path derivation. */
	readonly completionsUrl: string;
	/** API key resolved from secret storage by the language models service. */
	readonly apiKey?: string;
	/** Model identifier sent in the request body `model` field. */
	readonly model: string;
	/** Custom headers from the model configuration. */
	readonly requestHeaders?: Record<string, string>;
}

interface RegisteredGroupConfig {
	readonly vendor: string;
	readonly groupName: string;
	readonly configuration: IStringDictionary<unknown> | undefined;
}

const registeredGroupConfigs = new Map<string, RegisteredGroupConfig>();
let completionModels: ByokCompletionModel[] = [];

const _onDidChange = new Emitter<void>();
export const onDidChangeByokCompletionModels: Event<void> = _onDidChange.event;

/**
 * Called by the BYOK language model chat providers (see
 * `AbstractLanguageModelChatProvider.provideLanguageModelChatInformation`) once the
 * language models service has resolved a `chatLanguageModels.json` group. At that
 * point secrets such as `${input:...}` api keys are already decoded, so this is the
 * only place where the completion pipeline can obtain them.
 *
 * `groupName === undefined` marks the start of a new resolution pass: the language
 * models service invokes the provider once without a group before the per-group
 * calls, so every group previously seen for this vendor is dropped and then
 * re-added from the groups that still exist. This keeps the registry in sync when
 * a group is deleted from the file while the extension is running (hot swap).
 */
export function updateByokCompletionModelConfig(vendor: string, groupName: string | undefined, configuration: IStringDictionary<unknown> | undefined): void {
	if (groupName === undefined) {
		// Start of a new resolution pass for this vendor: drop its stale groups so
		// deleted groups do not linger in the registry and in the model picker.
		for (const [key, config] of registeredGroupConfigs) {
			if (config.vendor === vendor) {
				registeredGroupConfigs.delete(key);
			}
		}
		recomputeCompletionModels();
		return;
	}
	const key = `${vendor}/${groupName}`;
	if (!configuration) {
		registeredGroupConfigs.delete(key);
	} else {
		registeredGroupConfigs.set(key, { vendor, groupName, configuration });
	}
	recomputeCompletionModels();
}

/** Clears all registered group configs, e.g. when BYOK is disabled by enterprise policy. */
export function clearByokCompletionModelConfigs(): void {
	registeredGroupConfigs.clear();
	recomputeCompletionModels();
}

export function getByokCompletionModels(): readonly ByokCompletionModel[] {
	return completionModels;
}

export function getByokCompletionModelById(id: string): ByokCompletionModel | undefined {
	// Exact match on the generated identifier first, then fall back to the
	// `group/id` and `vendor/group/id` forms used by the chat model picker
	// (`toModelIdentifier`), so user-entered values like
	// `customendpoint/DS-oss/deepseek-v4-flash` also resolve.
	return completionModels.find(model =>
		model.id === id
		|| `${model.groupName}/${model.model}` === id
		|| `${model.vendor}/${model.groupName}/${model.model}` === id
	);
}

function recomputeCompletionModels(): void {
	const models: ByokCompletionModel[] = [];
	const usedIds = new Set<string>();

	for (const { vendor, groupName, configuration } of registeredGroupConfigs.values()) {
		if (!BYOK_COMPLETION_VENDORS.includes(vendor)) {
			continue;
		}
		parseGroupConfiguration(models, usedIds, vendor, groupName, configuration);
	}

	if (JSON.stringify(models) !== JSON.stringify(completionModels)) {
		completionModels = models;
		_onDidChange.fire();
	}
}

function parseGroupConfiguration(models: ByokCompletionModel[], usedIds: Set<string>, vendor: string, groupName: string, configuration: IStringDictionary<unknown> | undefined): void {
	if (!configuration || typeof configuration !== 'object') {
		return;
	}
	const groupCompletionsUrl = asOptionalString(configuration.completionsUrl);
	const apiKey = asOptionalString(configuration.apiKey);
	const configuredModels = configuration.models;
	if (!Array.isArray(configuredModels)) {
		return;
	}
	for (const entry of configuredModels) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const model = entry as IStringDictionary<unknown>;
		const modelId = asOptionalString(model.id);
		const url = asOptionalString(model.url);
		if (!modelId || !url) {
			// The model must have an id and a chat URL to be usable at all.
			continue;
		}
		const completionsUrl = asOptionalString(model.completionsUrl) ?? groupCompletionsUrl;
		if (!completionsUrl || !/^https?:\/\//.test(completionsUrl)) {
			// No (valid) completions URL configured: the model is chat-only.
			continue;
		}
		const id = computeUniqueId(modelId, groupName, vendor, usedIds);
		usedIds.add(id);
		models.push({
			id,
			label: asOptionalString(model.name) ?? modelId,
			vendor,
			groupName,
			completionsUrl,
			...(apiKey ? { apiKey } : {}),
			model: modelId,
			...(toStringRecord(model.requestHeaders) ? { requestHeaders: toStringRecord(model.requestHeaders) } : {}),
		});
	}
}

/**
 * The raw model id is the primary identifier; when multiple groups define models
 * with the same id, they are disambiguated by group name and vendor.
 */
function computeUniqueId(modelId: string, groupName: string, vendor: string, usedIds: Set<string>): string {
	const candidates = [modelId, `${groupName}/${modelId}`, `${vendor}/${groupName}/${modelId}`];
	for (const candidate of candidates) {
		if (!usedIds.has(candidate)) {
			return candidate;
		}
	}
	return `${vendor}/${groupName}/${modelId}/${usedIds.size}`;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const record: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === 'string') {
			record[key] = entry;
		}
	}
	return Object.keys(record).length > 0 ? record : undefined;
}
