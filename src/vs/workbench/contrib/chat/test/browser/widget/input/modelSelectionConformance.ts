/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ModelSelectionConformanceModel = 'first' | 'second' | 'missing';

/**
 * Whether a model already on the conversation is the conversation's own. Mirrors `ChatModelSource`:
 * a chosen model blocks `chat.defaultModel`, a carried-over one leaves an empty conversation open
 * to it.
 */
export type ModelSelectionConformanceSource = 'chosen' | 'carriedOver';

export interface IModelSelectionConformanceScenario {
	readonly name: string;
	readonly isEmpty: boolean;
	readonly models: readonly Exclude<ModelSelectionConformanceModel, 'missing'>[];
	readonly chatModel?: ModelSelectionConformanceModel;
	readonly chatModelSource?: ModelSelectionConformanceSource;
	readonly rememberedModel?: ModelSelectionConformanceModel;
	readonly configuredModel?: ModelSelectionConformanceModel;
	/** Whether the provider considers an absent requested model conclusively unavailable. */
	readonly catalogResolved?: boolean;
	readonly expected: {
		readonly currentModel: Exclude<ModelSelectionConformanceModel, 'missing'> | undefined;
		readonly conversationModel: Exclude<ModelSelectionConformanceModel, 'missing'> | undefined;
	};
}

/**
 * A scenario's inputs with nothing left implicit. Both arms destructure the whole shape, so a field
 * one of them stops reading becomes an unused local and fails to compile.
 */
export interface IModelSelectionConformanceInputs {
	readonly isEmpty: boolean;
	readonly models: readonly Exclude<ModelSelectionConformanceModel, 'missing'>[];
	readonly chatModel: ModelSelectionConformanceModel | undefined;
	readonly chatModelSource: ModelSelectionConformanceSource | undefined;
	readonly rememberedModel: ModelSelectionConformanceModel | undefined;
	readonly configuredModel: ModelSelectionConformanceModel | undefined;
	readonly catalogResolved: boolean;
}

export function conformanceInputs(scenario: IModelSelectionConformanceScenario): IModelSelectionConformanceInputs {
	return {
		isEmpty: scenario.isEmpty,
		models: scenario.models,
		chatModel: scenario.chatModel,
		chatModelSource: scenario.chatModelSource,
		rememberedModel: scenario.rememberedModel,
		configuredModel: scenario.configuredModel,
		catalogResolved: scenario.catalogResolved ?? true,
	};
}

/**
 * Shared precedence cases for the Workbench controller and the Sessions adapter.
 *
 * Both surfaces adopt a conversation's model through the same entry point, differing only in
 * whether they report it as the conversation's own, so these cases pin the shared policy rather
 * than each surface's wiring.
 *
 * How each surface works that out is its own business and is not covered here. Workbench reads it
 * from the conversation's in-memory intent, so it lasts only as long as the window; Sessions reads
 * it from the provider, which outlives a reload. The two therefore still answer differently for a
 * chat whose model predates the current window.
 *
 * This matrix deliberately covers stable-catalog policy rather than publication lifecycle.
 * Workbench may display a stand-in while a model is pending; Sessions intentionally waits rather
 * than writing that stand-in to a provider. Their final settled selection must still agree.
 */
export const modelSelectionConformanceScenarios: readonly IModelSelectionConformanceScenario[] = [
	{
		name: 'configured default beats remembered preference on an empty conversation',
		isEmpty: true,
		models: ['first', 'second'],
		rememberedModel: 'first',
		configuredModel: 'second',
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'remembered preference seeds an empty conversation without a configured default',
		isEmpty: true,
		models: ['first', 'second'],
		rememberedModel: 'second',
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'first available model seeds an empty conversation without another preference',
		isEmpty: true,
		models: ['first', 'second'],
		expected: { currentModel: 'first', conversationModel: 'first' },
	},
	{
		name: 'conversation choice blocks the configured default even while empty',
		isEmpty: true,
		models: ['first', 'second'],
		chatModel: 'first',
		chatModelSource: 'chosen',
		configuredModel: 'second',
		expected: { currentModel: 'first', conversationModel: 'first' },
	},
	{
		// The case the two surfaces used to answer differently: Sessions knew the model was a
		// choice, Workbench could only call it a restore and let the default win.
		name: 'a restored model the chat owns is not treated as carried over on an empty conversation',
		isEmpty: true,
		models: ['first', 'second'],
		chatModel: 'second',
		chatModelSource: 'chosen',
		rememberedModel: 'first',
		configuredModel: 'first',
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'a carried-over model yields to the configured default on an empty conversation',
		isEmpty: true,
		models: ['first', 'second'],
		chatModel: 'first',
		chatModelSource: 'carriedOver',
		configuredModel: 'second',
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'a carried-over model remains selected when no configured default exists',
		isEmpty: true,
		models: ['first', 'second'],
		chatModel: 'first',
		chatModelSource: 'carriedOver',
		expected: { currentModel: 'first', conversationModel: 'first' },
	},
	{
		name: 'configured default does not reseed a non-empty conversation choice',
		isEmpty: false,
		models: ['first', 'second'],
		chatModel: 'first',
		chatModelSource: 'chosen',
		configuredModel: 'second',
		expected: { currentModel: 'first', conversationModel: 'first' },
	},
	{
		name: 'configured default does not reseed a non-empty carried-over model',
		isEmpty: false,
		models: ['first', 'second'],
		chatModel: 'first',
		chatModelSource: 'carriedOver',
		configuredModel: 'second',
		expected: { currentModel: 'first', conversationModel: 'first' },
	},
	{
		name: 'unresolvable configured value falls through to the remembered preference',
		isEmpty: true,
		models: ['first', 'second'],
		rememberedModel: 'second',
		configuredModel: 'missing',
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'available configured default supersedes a remembered model while its vendor is unresolved',
		isEmpty: true,
		models: ['first', 'second'],
		rememberedModel: 'missing',
		configuredModel: 'second',
		catalogResolved: false,
		expected: { currentModel: 'second', conversationModel: 'second' },
	},
	{
		name: 'empty catalog leaves the conversation without a model',
		isEmpty: true,
		models: [],
		expected: { currentModel: undefined, conversationModel: undefined },
	},
];
