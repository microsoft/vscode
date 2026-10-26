/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelChat } from 'vscode';
import { describe, expect, test } from 'vitest';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { CHAT_MODEL } from '../../../configuration/common/configurationService';
import { IChatModelInformation } from '../../common/endpointProvider';
import { IModelMetadataFetcher } from '../../node/modelMetadataFetcher';
import { CopilotUtilityChatEndpoint, CopilotUtilitySmallChatEndpoint } from '../../node/copilotChatEndpoint';

/**
 * Builds a minimal valid chat model record as it would appear in the
 * hydrated CAPI `/models` response.
 */
function chatModel(id: string, family: string, isChatFallback = false): IChatModelInformation {
	return {
		id,
		vendor: 'openai',
		name: id,
		version: '1.0',
		model_picker_enabled: false,
		is_chat_default: false,
		is_chat_fallback: isChatFallback,
		capabilities: {
			type: 'chat',
			family,
			tokenizer: 'o200k_base' as any,
			limits: { max_prompt_tokens: 8192, max_output_tokens: 4096 },
			supports: { streaming: undefined },
		},
	};
}

/**
 * A fake `IModelMetadataFetcher` that mimics the real one's lookup semantics
 * against an in-memory set of models, including the same error message as the
 * real implementation when a CAPI family is absent.
 */
class FakeModelMetadataFetcher implements IModelMetadataFetcher {
	private readonly _byFamily = new Map<string, IChatModelInformation[]>();
	private _utilityModel: IChatModelInformation | undefined;

	constructor(models: IChatModelInformation[]) {
		for (const model of models) {
			const family = model.capabilities.family;
			const list = this._byFamily.get(family) ?? [];
			list.push(model);
			this._byFamily.set(family, list);
			if (model.is_chat_fallback) {
				this._utilityModel = model;
			}
		}
	}

	onDidModelsRefresh = (() => { /* noop */ }) as any;

	async getAllCompletionModels(): Promise<any> { return []; }
	async getAllChatModels(): Promise<IChatModelInformation[]> {
		return Array.from(this._byFamily.values()).flat();
	}
	async getChatModelFromApiModel(_model: LanguageModelChat): Promise<IChatModelInformation | undefined> { return undefined; }
	async getEmbeddingsModel(): Promise<any> { throw new Error('not implemented'); }

	async getCopilotUtilityModel(): Promise<IChatModelInformation> {
		if (!this._utilityModel) {
			throw new Error('Unable to resolve Copilot utility chat model (server did not mark a chat fallback model)');
		}
		return this._utilityModel;
	}

	async getChatModelFromCapiFamily(family: string): Promise<IChatModelInformation> {
		const resolved = this._byFamily.get(family)?.[0];
		if (!resolved) {
			throw new Error(`Unable to resolve chat model with CAPI family selection: ${family}`);
		}
		return resolved;
	}
}

/**
 * A fake instantiation service whose `createInstance` records the model
 * metadata it was handed, so the test can assert which model the resolver
 * ultimately selected without building the full `CopilotChatEndpoint`.
 */
function fakeInstantiationService(): { service: IInstantiationService; lastModel: () => IChatModelInformation | undefined } {
	let last: IChatModelInformation | undefined;
	const service = {
		createInstance: (_ctor: unknown, modelMetadata: IChatModelInformation) => {
			last = modelMetadata;
			return { model: modelMetadata.id } as any;
		},
	} as unknown as IInstantiationService;
	return { service, lastModel: () => last };
}

describe('CopilotUtilitySmallChatEndpoint.resolve (issue #321184)', () => {
	test('falls back to the base utility model when the gpt-4o-mini family is absent from /models', async () => {
		// CAPI `/models` for this user contains a base chat-fallback model, but
		// no model in the client-selected small family (gpt-4o-mini). This mirrors
		// the plan/region/rollout differences reported in issue #321184.
		const fetcher = new FakeModelMetadataFetcher([
			chatModel('gpt-4.1', 'gpt-4.1', /* isChatFallback */ true),
		]);
		const { service, lastModel } = fakeInstantiationService();

		// Sanity: the small family really is unresolvable for this user.
		await expect(fetcher.getChatModelFromCapiFamily(CHAT_MODEL.GPT4OMINI)).rejects.toThrow(
			'Unable to resolve chat model with CAPI family selection: gpt-4o-mini'
		);

		// The resolver must degrade gracefully to the base utility model rather
		// than letting the lookup throw through every copilot-utility-small caller.
		await CopilotUtilitySmallChatEndpoint.resolve(fetcher, service);

		expect(lastModel()?.id).toBe('gpt-4.1');
	});

	test('uses the gpt-4o-mini family when it is present', async () => {
		const fetcher = new FakeModelMetadataFetcher([
			chatModel('gpt-4o-mini', CHAT_MODEL.GPT4OMINI),
			chatModel('gpt-4.1', 'gpt-4.1', /* isChatFallback */ true),
		]);
		const { service, lastModel } = fakeInstantiationService();

		await CopilotUtilitySmallChatEndpoint.resolve(fetcher, service);

		expect(lastModel()?.id).toBe('gpt-4o-mini');
	});

	test('sibling CopilotUtilityChatEndpoint.resolve already degrades gracefully', async () => {
		// The sibling resolver is unaffected because it uses getCopilotUtilityModel().
		const fetcher = new FakeModelMetadataFetcher([
			chatModel('gpt-4.1', 'gpt-4.1', /* isChatFallback */ true),
		]);
		const { service, lastModel } = fakeInstantiationService();

		await CopilotUtilityChatEndpoint.resolve(fetcher, service);

		expect(lastModel()?.id).toBe('gpt-4.1');
	});
});
