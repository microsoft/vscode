/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions } from '../client/request.js';
import { JsonValue } from '../client/types.js';

/** A Copilot model's advertised limits and features. */
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

/** Copilot cloud model metadata, including entries hidden or disabled by policy. */
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
	/** Billing metadata interpreted by the caller's pricing normalizer. */
	readonly billing?: JsonValue;
	/** The model's capability category in the picker. */
	readonly model_picker_category?: string;
	/** The model's price category in the picker. */
	readonly model_picker_price_category?: string;
	/** The advertised limits and optional features. */
	readonly capabilities?: ModelCapabilities;
}

/** The model catalog returned by the Copilot cloud agent endpoint. */
export interface ListModelsResponse {
	/** The complete model list, before caller-side filtering. */
	readonly data: readonly Model[];
	/** The service-selected default model, when advertised. */
	readonly default_model?: string;
}

/** Model discovery through the approved Copilot API endpoint. */
export interface IModelsClient {
	/** GET /agents/swe/models: read the cloud agent catalog without UI filtering or normalization. */
	list(signal: AbortSignal, options?: ApiRequestOptions): Promise<ListModelsResponse>;
}
