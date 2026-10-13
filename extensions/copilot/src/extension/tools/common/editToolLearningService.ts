/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelChat } from 'vscode';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { createServiceIdentifier } from '../../../util/common/services';
import { LRUCache } from '../../../util/vs/base/common/map';
import { mapValues } from '../../../util/vs/base/common/objects';
import { isDefined } from '../../../util/vs/base/common/types';
import { EditTools as _EditTools, EDIT_TOOL_LEARNING_STATES, IEditToolLearningData, LearningConfig, State } from './editToolLearningStates';
import { byokEditToolNamesToToolNames, ToolName } from './toolNames';

export type EditTools = _EditTools;

const CACHE_STORAGE_KEY = 'editToolLearning_cache';

function mapToolsRecord<I, O>(record: { [K in EditTools]?: I }, fn: (input: I, tool: EditTools) => O) {
	return mapValues(record, (value, key) => fn(value!, key as EditTools)) as { [K in EditTools]?: O };
}

interface IStoredToolData {
	state: State;
	tools: { [K in EditTools]?: { successBitset: string; attempts: number } };
}

export const IEditToolLearningService = createServiceIdentifier<IEditToolLearningService>('IEditToolLearningService');

export interface IEditToolLearningService {
	readonly _serviceBrand: undefined;
	getPreferredEditTool(model: LanguageModelChat): Promise<EditTools[] | undefined>;
	getPreferredEndpointEditTool(model: IChatEndpoint): EditTools[] | undefined;
	didMakeEdit(model: LanguageModelChat, tool: EditTools, success: boolean): void;
}

function addToWindow(window: bigint, bit: bigint): bigint {
	// Shift left to make room for new bit, add the bit, then mask to WINDOW_SIZE
	const mask = (1n << BigInt(LearningConfig.WINDOW_SIZE)) - 1n;
	return ((window << 1n) | bit) & mask;
}

export class EditToolLearningService implements IEditToolLearningService {
	readonly _serviceBrand: undefined;

	private _cache?: LRUCache<string, IEditToolLearningData>;

	constructor(
		@IVSCodeExtensionContext private readonly _context: IVSCodeExtensionContext,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	async getPreferredEditTool(model: LanguageModelChat): Promise<EditTools[] | undefined> {
		const endpoint = await this._endpointProvider.getChatEndpoint(model);
		return this.getPreferredEndpointEditTool(endpoint);
	}

	getPreferredEndpointEditTool(endpoint: IChatEndpoint): EditTools[] | undefined {
		if (!endpoint.isExtensionContributed) {
			return undefined;
		}

		const fromEndpoint = endpoint.supportedEditTools
			?.map(e => byokEditToolNamesToToolNames.hasOwnProperty(e) ? byokEditToolNamesToToolNames[e] : undefined)
			.filter(isDefined);
		if (fromEndpoint?.length) {
			return fromEndpoint;
		}

		// Note: looking at the 'name' rather than 'model' is intentional, 'model' is the user-
		// provided model ID whereas the 'name' is the name of the model on the BYOK provider.
		const hardcoded = this._getHardcodedPreferences(endpoint.name);
		if (hardcoded) {
			return hardcoded;
		}

		const learningData = this._getModelLearningData(endpoint.model);
		return this._computePreferences(learningData);
	}

	async didMakeEdit(model: LanguageModelChat, tool: EditTools, success: boolean): Promise<void> {
		const endpoint = await this._endpointProvider.getChatEndpoint(model);

		if (!endpoint.isExtensionContributed || this._getHardcodedPreferences(endpoint.family)) {
			return;
		}

		const learningData = this._getModelLearningData(model.id);
		this._recordEdit(model.id, learningData, tool, success);
		await this._saveModelLearningData(model.id, learningData);
	}

	private _getHardcodedPreferences(family: string): EditTools[] | undefined {
		const lowerFamily = family.toLowerCase();

		if (lowerFamily.includes('gpt') || lowerFamily.includes('openai')) {
			return [ToolName.ApplyPatch];
		}

		if (lowerFamily.includes('sonnet')) {
			return [ToolName.ReplaceString, ToolName.MultiReplaceString];
		}

		return undefined;
	}

	private _computePreferences(data: IEditToolLearningData): EditTools[] | undefined {
		return EDIT_TOOL_LEARNING_STATES[data.state].allowedTools;
	}

	private _checkStateTransitions(modelId: string, data: IEditToolLearningData): State {
		const currentConfig = EDIT_TOOL_LEARNING_STATES[data.state];

		if (!currentConfig.transitions) {
			return data.state;
		}

		for (const [targetState, condition] of Object.entries(currentConfig.transitions)) {
			if (!condition(data)) {
				continue;
			}

			const target = Number(targetState) as State;

			/* __GDPR__
				"editToolLearning.transition" : {
					"owner": "connor4312",
					"comment": "Tracks state transitions in the edit tool learning system.",
					"modelId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model ID" },
					"state": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "State the model transitioned to", "isMeasurement": true }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('editToolLearning.transition', { modelId }, {
				state: target,
			});

			return target;
		}

		return data.state; // No transition
	}

	private _recordEdit(modelId: string, data: IEditToolLearningData, tool: EditTools, success: boolean): void {
		const successBit = success ? 1n : 0n;
		const toolData = (data.tools[tool] ??= { successBitset: 0n, attempts: 0 });
		toolData.successBitset = addToWindow(toolData.successBitset, successBit);
		toolData.attempts++;

		const newState = this._checkStateTransitions(modelId, data);
		if (newState !== data.state) {
			data.state = newState;
			data.tools = {};
		}
	}

	private _getCache(): LRUCache<string, IEditToolLearningData> {
		if (!this._cache) {
			this._cache = this._loadCacheFromStorage();
		}
		return this._cache;
	}

	private _loadCacheFromStorage(): LRUCache<string, IEditToolLearningData> {
		const cache = new LRUCache<string, IEditToolLearningData>(LearningConfig.CACHE_SIZE);
		const storedCacheData = this._context.globalState.get<{ entries: [string, IStoredToolData][] }>(CACHE_STORAGE_KEY);

		if (!storedCacheData?.entries) {
			return cache;
		}

		for (const [modelId, storedData] of storedCacheData.entries) {
			const data: IEditToolLearningData = {
				state: storedData.state,
				tools: mapToolsRecord(storedData.tools, r => ({
					successBitset: BigInt(r.successBitset),
					attempts: r.attempts,
				})),
			};
			cache.set(modelId, data);
		}

		return cache;
	}

	private async _saveCacheToStorage(): Promise<void> {
		if (!this._cache) {
			return;
		}

		const entries: [string, IStoredToolData][] = Array.from(this._cache.entries(), ([modelId, data]) => {
			const storedData = {
				state: data.state,
				tools: mapToolsRecord(data.tools, r => ({
					successBitset: '0x' + r.successBitset.toString(16),
					attempts: r.attempts
				})),
			};
			return [modelId, storedData];
		});

		await this._context.globalState.update(CACHE_STORAGE_KEY, { entries });
	}

	private async _saveModelLearningData(modelId: string, data: IEditToolLearningData): Promise<void> {
		const cache = this._getCache();
		cache.set(modelId, data);
		await this._saveCacheToStorage();
	}

	private _getModelLearningData(modelId: string): IEditToolLearningData {
		const cache = this._getCache();

		let data = cache.get(modelId);
		if (!data) {
			data = { state: State.Initial, tools: {} };
			cache.set(modelId, data);
		}
		return data;
	}
}
