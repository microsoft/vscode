/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenAI } from '@vscode/prompt-tsx';
import { TokenizerType } from '../../../../util/common/tokenizer';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { IChatMLFetcher } from '../../../chat/common/chatMLFetcher';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IEnvService } from '../../../env/common/envService';
import { ILogService } from '../../../log/common/logService';
import { isOpenAiFunctionTool } from '../../../networking/common/fetch';
import { IFetcherService } from '../../../networking/common/fetcherService';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody } from '../../../networking/common/networking';
import { CAPIChatMessage, RawMessageConversionCallback } from '../../../networking/common/openai';
import { IChatWebSocketManager } from '../../../networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../tokenizer/node/tokenizer';
import { ICAPIClientService } from '../../common/capiClient';
import { IDomainService } from '../../common/domainService';
import { IChatModelInformation, ModelSupportedEndpoint } from '../../common/endpointProvider';
import { ChatEndpoint } from '../../node/chatEndpoint';

export type IModelConfig = {
	id: string;
	name: string;
	version: string;
	useDeveloperRole: boolean;
	type: 'openai' | 'azureOpenai';
	capabilities: {
		supports: {
			parallel_tool_calls: boolean;
			streaming: boolean;
			tool_calls: boolean;
			vision: boolean;
			prediction: boolean;
			thinking: boolean;
		};
		limits: {
			max_prompt_tokens: number;
			max_output_tokens: number;
			max_context_window_tokens?: number;
		};
	};
	supported_endpoints: readonly ModelSupportedEndpoint[];
	url: string;
	auth: {
		/**
		 * Use Bearer token for authentication
		 */
		useBearerHeader: boolean;
		/**
		 * Use API key for authentication
		 */
		useApiKeyHeader: boolean;
		/**
		 * The environment variable name for the API key
		 */
		apiKeyEnvName?: string;
	};
	overrides: {
		requestHeaders: Record<string, string>;
		// If any value is set to null, it will be deleted from the request body
		// if the value is undefined, it will not override any existing value in the request body
		// if the value is set, it will override the existing value in the request body
		temperature?: number | null;
		top_p?: number | null;
		snippy?: boolean | null;
		max_tokens?: number | null;
		max_completion_tokens?: number | null;
		intent?: boolean | null;
	};
}

export class OpenAICompatibleTestEndpoint extends ChatEndpoint {
	constructor(
		private readonly modelConfig: IModelConfig,
		@IDomainService domainService: IDomainService,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IFetcherService fetcherService: IFetcherService,
		@IEnvService envService: IEnvService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAuthenticationService authService: IAuthenticationService,
		@IChatMLFetcher chatMLFetcher: IChatMLFetcher,
		@ITokenizerProvider tokenizerProvider: ITokenizerProvider,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IChatWebSocketManager chatWebSocketService: IChatWebSocketManager,
		@ILogService logService: ILogService
	) {
		const modelInfo: IChatModelInformation = {
			id: modelConfig.id,
			vendor: 'OpenAI Compatible',
			name: modelConfig.name,
			version: modelConfig.version,
			model_picker_enabled: false,
			is_chat_default: false,
			is_chat_fallback: false,
			capabilities: {
				type: 'chat',
				family: modelConfig.type === 'azureOpenai' ? 'azure' : 'openai',
				tokenizer: TokenizerType.O200K,
				supports: {
					parallel_tool_calls: modelConfig.capabilities.supports.parallel_tool_calls,
					streaming: modelConfig.capabilities.supports.streaming,
					tool_calls: modelConfig.capabilities.supports.tool_calls,
					vision: modelConfig.capabilities.supports.vision,
					prediction: modelConfig.capabilities.supports.prediction,
					thinking: modelConfig.capabilities.supports.thinking ?? false
				},
				limits: {
					max_prompt_tokens: modelConfig.capabilities.limits.max_prompt_tokens,
					max_output_tokens: modelConfig.capabilities.limits.max_output_tokens,
					max_context_window_tokens: modelConfig.capabilities.limits.max_context_window_tokens
				}
			},
			supported_endpoints: Array.isArray(modelConfig.supported_endpoints) && modelConfig.supported_endpoints.length > 0
				? modelConfig.supported_endpoints
				: [ModelSupportedEndpoint.ChatCompletions]
		};

		super(
			modelInfo,
			domainService,
			chatMLFetcher,
			tokenizerProvider,
			instantiationService,
			configurationService,
			experimentationService,
			chatWebSocketService,
			logService
		);
	}

	override get urlOrRequestMetadata(): string {
		return this.modelConfig.version ? this.modelConfig.url + '?api-version=' + this.modelConfig.version : this.modelConfig.url;
	}

	public override getExtraHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this.modelConfig.auth.useBearerHeader || this.modelConfig.auth.useApiKeyHeader) {
			if (!this.modelConfig.auth.apiKeyEnvName) {
				throw new Error('API key environment variable name is not set in the model configuration');
			}
			const apiKey = process.env[this.modelConfig.auth.apiKeyEnvName];
			if (!apiKey) {
				throw new Error(`API key environment variable ${this.modelConfig.auth.apiKeyEnvName} is not set`);
			}

			if (this.modelConfig.auth.useBearerHeader) {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}

			if (this.modelConfig.auth.useApiKeyHeader) {
				headers['api-key'] = apiKey;
			}
		}

		if (this.modelConfig.overrides.requestHeaders) {
			Object.entries(this.modelConfig.overrides.requestHeaders).forEach(([key, value]) => {
				headers[key] = value;
			});
		}

		return headers;
	}

	override createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		if (this.useResponsesApi) {
			// Handle Responses API: customize the body directly
			options.ignoreStatefulMarker = false;
			const body = super.createRequestBody(options);
			body.store = true;
			body.n = undefined;
			body.stream_options = undefined;
			if (!this.modelConfig.capabilities.supports.thinking) {
				body.reasoning = undefined;
			}
			return body;
		}
		const body = super.createRequestBody(options);
		return body;
	}

	override interceptBody(body: IEndpointBody | undefined): void {
		super.interceptBody(body);

		if (body?.tools?.length === 0) {
			delete body.tools;
		}

		if (body?.messages) {
			body.messages.forEach((message: any) => {
				if (message.copilot_cache_control) {
					delete message.copilot_cache_control;
				}
			});
		}

		if (body) {
			if (this.modelConfig.overrides.snippy === null) {
				delete body.snippy;
			} else if (this.modelConfig.overrides.snippy) {
				body.snippy = { enabled: this.modelConfig.overrides.snippy };
			}

			if (this.modelConfig.overrides.intent === null) {
				delete body.intent;
			} else if (this.modelConfig.overrides.intent) {
				body.intent = this.modelConfig.overrides.intent;
			}

			if (this.modelConfig.overrides.temperature === null) {
				delete body.temperature;
			} else if (this.modelConfig.overrides.temperature) {
				body.temperature = this.modelConfig.overrides.temperature;
			}

			if (this.modelConfig.overrides.top_p === null) {
				delete body.top_p;
			} else if (this.modelConfig.overrides.top_p) {
				body.top_p = this.modelConfig.overrides.top_p;
			}

			if (this.modelConfig.overrides.max_tokens === null) {
				delete body.max_tokens;
			} else if (this.modelConfig.overrides.max_tokens) {
				body.max_tokens = this.modelConfig.overrides.max_tokens;
			}
		}

		if (body?.tools) {
			body.tools = body.tools.map(tool => {
				if (isOpenAiFunctionTool(tool) && tool.function.parameters === undefined) {
					tool.function.parameters = { type: 'object', properties: {} };
				}
				return tool;
			});
		}

		if (this.modelConfig.type === 'openai') {
			if (body) {
				if (!this.useResponsesApi) {
					// we need to set this to unsure usage stats are logged
					body['stream_options'] = { 'include_usage': true };
				}
				// OpenAI requires the model name to be set in the body
				body.model = this.modelConfig.name;

				// Handle messages reformatting if messages exist
				if (body.messages) {
					const newMessages: CAPIChatMessage[] = body.messages.map((message: CAPIChatMessage): CAPIChatMessage => {
						if (message.role === OpenAI.ChatRole.System) {
							return {
								role: OpenAI.ChatRole.User,
								content: message.content,
							};
						} else {
							return message;
						}
					});
					body['messages'] = newMessages;
				}
			}
		}

		if (this.modelConfig.useDeveloperRole && body) {
			const newMessages = body.messages!.map((message: CAPIChatMessage) => {
				if (message.role === OpenAI.ChatRole.System) {
					return { role: 'developer' as OpenAI.ChatRole.System, content: message.content };
				}
				return message;
			});
			Object.keys(body).forEach(key => delete (body as any)[key]);
			body.messages = newMessages;
		}
	}

	override cloneWithTokenOverride(_modelMaxPromptTokens: number): IChatEndpoint {
		return this.instantiationService.createInstance(OpenAICompatibleTestEndpoint, this.modelConfig);
	}

	protected override getCompletionsCallback(): RawMessageConversionCallback | undefined {
		return (out, data) => {
			if (data && data.id) {
				out.cot_id = data.id;
				out.cot_summary = Array.isArray(data.text) ? data.text.join('') : data.text;
			}
		};
	}
}
