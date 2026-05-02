/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ambient type declarations for @vscode/copilot-api.
 *
 * The package's .d.ts files use extensionless relative imports which are
 * incompatible with `moduleResolution: "nodenext"`. This file provides
 * the subset of types used by the agent host until the package is fixed.
 */
declare module '@vscode/copilot-api' {

	export interface IAbortSignal {
		readonly aborted: boolean;
		addEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
		removeEventListener(type: 'abort', listener: (this: AbortSignal) => void): void;
	}

	export interface FetchOptions {
		callSite: string;
		headers?: { [name: string]: string };
		body?: BodyInit;
		timeout?: number;
		json?: unknown;
		method?: 'GET' | 'POST' | 'PUT';
		signal?: IAbortSignal;
		suppressIntegrationId?: boolean;
	}

	export type MakeRequestOptions = Omit<FetchOptions, 'callSite'> & {
		callSite?: string;
	};

	export interface IFetcherService {
		fetch(url: string, options: FetchOptions): Promise<unknown>;
	}

	export interface IExtensionInformation {
		name: string;
		sessionId: string;
		machineId: string;
		deviceId: string;
		vscodeVersion: string;
		version: string;
		buildType: 'dev' | 'prod';
	}

	export interface CopilotToken {
		endpoints: {
			api?: string;
			telemetry?: string;
			proxy?: string;
			'origin-tracker'?: string;
		};
		sku: string;
	}

	export enum RequestType {
		CopilotToken = 'CopilotToken',
		ChatCompletions = 'ChatCompletions',
		ChatResponses = 'ChatResponses',
		ChatMessages = 'ChatMessages',
		Models = 'Models',
	}

	export type RequestMetadata =
		| { type: RequestType.CopilotToken }
		| { type: RequestType.ChatCompletions | RequestType.ChatResponses | RequestType.ChatMessages | RequestType.Models; isModelLab?: boolean };

	export interface IDomainChangeResponse {
		capiUrlChanged: boolean;
		telemetryUrlChanged: boolean;
		dotcomUrlChanged: boolean;
		proxyUrlChanged: boolean;
	}

	export class CAPIClient {
		constructor(
			extensionInfo: IExtensionInformation,
			license: string | undefined,
			fetcherService?: IFetcherService,
			hmacSecret?: string,
			integrationId?: string,
		);
		updateDomains(copilotToken: CopilotToken | undefined, enterpriseUrlConfig: string | undefined): IDomainChangeResponse;
		makeRequest<T>(requestOptions: MakeRequestOptions, requestMetadata: RequestMetadata): Promise<T>;
	}

	interface CCAModelBilling {
		is_premium: boolean;
		multiplier: number;
		restricted_to: string[];
	}

	interface CCAModelVisionLimits {
		max_prompt_image_size: number;
		max_prompt_images: number;
		supported_media_types: string[];
	}

	interface CCAModelLimits {
		max_context_window_tokens: number;
		max_output_tokens: number;
		max_prompt_tokens: number;
		vision?: CCAModelVisionLimits;
	}

	interface CCAModelSupports {
		max_thinking_budget?: number;
		min_thinking_budget?: number;
		parallel_tool_calls: boolean;
		streaming: boolean;
		tool_calls: boolean;
		vision: boolean;
	}

	interface CCAModelCapabilities {
		family: string;
		limits: CCAModelLimits;
		object: string;
		supports: CCAModelSupports;
		tokenizer: string;
		type: string;
	}

	interface CCAModelPolicy {
		state: string;
		terms: string;
	}

	export interface CCAModel {
		billing: CCAModelBilling;
		capabilities: CCAModelCapabilities;
		id: string;
		is_chat_default: boolean;
		is_chat_fallback: boolean;
		model_picker_category: string;
		model_picker_enabled: boolean;
		name: string;
		object: string;
		policy: CCAModelPolicy;
		preview: boolean;
		/**
		 * API endpoints the model supports (e.g. `'/v1/messages'`, `'/chat/completions'`).
		 * Anthropic-format models use `'/v1/messages'`.
		 */
		supported_endpoints: string[] | undefined;
		vendor: string;
		version: string;
	}
}
