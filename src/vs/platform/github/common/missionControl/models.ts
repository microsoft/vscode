/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonValue } from '../client/types.js';

/** A Copilot model's limits and features, before session-UI normalization. */
export interface ModelCapabilities {
	/** Token limits advertised for the model. */
	readonly limits?: {
		/** Maximum combined context size. */
		readonly max_context_window_tokens?: number;
		/** Maximum input size. */
		readonly max_prompt_tokens?: number;
		/** Maximum output size. */
		readonly max_output_tokens?: number;
	};
	/** Optional features supported by the model. */
	readonly supports?: {
		/** Whether image input is supported. */
		readonly vision?: boolean;
		/** Supported reasoning-effort values in their advertised order. */
		readonly reasoning_effort?: readonly string[];
	};
}

/** Copilot model metadata used by sandbox clients without filtering policy-disabled entries. */
export interface Model {
	/** The stable model identifier used in task and session requests. */
	readonly id: string;
	/** The human-readable model name. */
	readonly name: string;
	/** Whether Copilot exposes the model in its picker. */
	readonly model_picker_enabled?: boolean;
	/** The account's policy for this model. */
	readonly policy?: {
		/** The service-provided policy state, including disabled. */
		readonly state?: string;
	};
	/** Opaque billing metadata retained for the consumer's pricing normalizer. */
	readonly billing?: JsonValue;
	/** The model's capability category in the picker. */
	readonly model_picker_category?: string;
	/** The model's price category in the picker. */
	readonly model_picker_price_category?: string;
	/** The advertised limits and optional features. */
	readonly capabilities?: ModelCapabilities;
}

/** The Copilot catalog returned by the sandbox models endpoint. */
export interface ListModelsResponse {
	/** The complete returned model list, including entries hidden or disabled by policy. */
	readonly data: readonly Model[];
	/** The service-selected default model, when advertised. */
	readonly default_model?: string;
}

/** Model discovery on the separately configured Copilot API host. */
export interface IModelsClient {
	/** GET /agents/swe/models on the Copilot API host, without caching or UI normalization. */
	list(signal: AbortSignal): Promise<ListModelsResponse>;
}
