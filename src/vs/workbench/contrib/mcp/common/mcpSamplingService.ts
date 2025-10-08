/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { Sequencer } from '../../../../base/common/async.js';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, getConfigValueInTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ChatImageMimeType, ChatMessageRole, IChatMessage, IChatMessagePart, ILanguageModelsService } from '../../chat/common/languageModels.js';
import { McpCommandIds } from './mcpCommandIds.js';
import { IMcpServerSamplingConfiguration, mcpServerSamplingSection } from './mcpConfiguration.js';
import { McpSamplingLog } from './mcpSamplingLog.js';
import { IMcpSamplingService, IMcpServer, ISamplingOptions, ISamplingResult, McpError } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

const enum ModelMatch {
	UnsureAllowedDuringChat,
	UnsureAllowedOutsideChat,
	NotAllowed,
	NoMatchingModel,
}

export class McpSamplingService extends Disposable implements IMcpSamplingService {
	declare readonly _serviceBrand: undefined;

	private readonly _sessionSets = {
		allowedDuringChat: new Map<string, boolean>(),
		allowedOutsideChat: new Map<string, boolean>(),
	};

	private readonly _logs: McpSamplingLog;

	private readonly _modelSequencer = new Sequencer();

	constructor(
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();
		this._logs = this._register(instaService.createInstance(McpSamplingLog));
	}

	async sample(opts: ISamplingOptions, token = CancellationToken.None): Promise<ISamplingResult> {
		const messages = opts.params.messages.map((message): IChatMessage | undefined => {
			const content: IChatMessagePart | undefined = message.content.type === 'text'
				? { type: 'text', value: message.content.text }
				: message.content.type === 'image' || message.content.type === 'audio'
					? { type: 'image_url', value: { mimeType: message.content.mimeType as ChatImageMimeType, data: decodeBase64(message.content.data) } }
					: undefined;
			if (!content) {
				return undefined;
			}
			return {
				role: message.role === 'assistant' ? ChatMessageRole.Assistant : ChatMessageRole.User,
				content: [content]
			};
		}).filter(isDefined);

		if (opts.params.systemPrompt) {
			messages.unshift({ role: ChatMessageRole.System, content: [{ type: 'text', value: opts.params.systemPrompt }] });
		}

		const model = await this._modelSequencer.queue(() => this._getMatchingModel(opts));
		// todo@connor4312: nullExtensionDescription.identifier -> undefined with API update
		const response = await this._languageModelsService.sendChatRequest(model, new ExtensionIdentifier('core'), messages, {}, token);

		let responseText = '';

		// MCP doesn't have a notion of a multi-part sampling response, so we only preserve text
		// Ref https://github.com/modelcontextprotocol/modelcontextprotocol/issues/91
		const streaming = (async () => {
			for await (const part of response.stream) {
				if (Array.isArray(part)) {
					for (const p of part) {
						if (p.type === 'text') {
							responseText += p.value;
						}
					}
				} else if (part.type === 'text') {
					responseText += part.value;
				}
			}
		})();

		try {
			await Promise.all([response.result, streaming]);
			this._logs.add(opts.server, opts.params.messages, responseText, model);
			return {
				sample: {
					model,
					content: { type: 'text', text: responseText },
					role: 'assistant', // it came from the model!
				},
			};
		} catch (err) {
			throw McpError.unknown(err);
		}
	}

	hasLogs(server: IMcpServer): boolean {
		return this._logs.has(server);
	}

	getLogText(server: IMcpServer): string {
		return this._logs.getAsText(server);
	}

	private async _getMatchingModel(opts: ISamplingOptions): Promise<string> {
		const model = await this._getMatchingModelInner(opts.server, opts.isDuringToolCall, opts.params.modelPreferences);

		if (model === ModelMatch.UnsureAllowedDuringChat) {
			const retry = await this._showContextual(
				opts.isDuringToolCall,
				localize('mcp.sampling.allowDuringChat.title', 'Allow MCP tools from "{0}" to make LLM requests?', opts.server.definition.label),
				localize('mcp.sampling.allowDuringChat.desc', 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests during chat?', opts.server.definition.label),
				this.allowButtons(opts.server, 'allowedDuringChat')
			);
			if (retry) {
				return this._getMatchingModel(opts);
			}
			throw McpError.notAllowed();
		} else if (model === ModelMatch.UnsureAllowedOutsideChat) {
			const retry = await this._showContextual(
				opts.isDuringToolCall,
				localize('mcp.sampling.allowOutsideChat.title', 'Allow MCP server "{0}" to make LLM requests?', opts.server.definition.label),
				localize('mcp.sampling.allowOutsideChat.desc', 'The MCP server "{0}" has issued a request to make a language model call. Do you want to allow it to make requests, outside of tool calls during chat?', opts.server.definition.label),
				this.allowButtons(opts.server, 'allowedOutsideChat')
			);
			if (retry) {
				return this._getMatchingModel(opts);
			}
			throw McpError.notAllowed();
		} else if (model === ModelMatch.NotAllowed) {
			throw McpError.notAllowed();
		} else if (model === ModelMatch.NoMatchingModel) {
			const newlyPickedModels = opts.isDuringToolCall
				? await this._commandService.executeCommand<number>(McpCommandIds.ConfigureSamplingModels, opts.server)
				: await this._notify(
					localize('mcp.sampling.needsModels', 'MCP server "{0}" triggered a language model request, but it has no allowlisted models.', opts.server.definition.label),
					{
						[localize('configure', 'Configure')]: () => this._commandService.executeCommand<number>(McpCommandIds.ConfigureSamplingModels, opts.server),
						[localize('cancel', 'Cancel')]: () => Promise.resolve(undefined),
					}
				);
			if (newlyPickedModels) {
				return this._getMatchingModel(opts);
			}
			throw McpError.notAllowed();
		}

		return model;
	}

	private allowButtons(server: IMcpServer, key: 'allowedDuringChat' | 'allowedOutsideChat') {
		return {
			[localize('mcp.sampling.allow.inSession', 'Allow in this Session')]: async () => {
				this._sessionSets[key].set(server.definition.id, true);
				return true;
			},
			[localize('mcp.sampling.allow.always', 'Always')]: async () => {
				await this.updateConfig(server, c => c[key] = true);
				return true;
			},
			[localize('mcp.sampling.allow.notNow', 'Not Now')]: async () => {
				this._sessionSets[key].set(server.definition.id, false);
				return false;
			},
			[localize('mcp.sampling.allow.never', 'Never')]: async () => {
				await this.updateConfig(server, c => c[key] = false);
				return false;
			},
		};
	}

	private async _showContextual<T>(isDuringToolCall: boolean, title: string, message: string, buttons: Record<string, () => T>): Promise<Awaited<T> | undefined> {
		if (isDuringToolCall) {
			const result = await this._dialogService.prompt({
				type: 'question',
				title: title,
				message,
				buttons: Object.entries(buttons).map(([label, run]) => ({ label, run })),
			});
			return await result.result;
		} else {
			return await this._notify(message, buttons);
		}
	}

	private async _notify<T>(message: string, buttons: Record<string, () => T>): Promise<Awaited<T> | undefined> {
		return await new Promise<T | undefined>(resolve => {
			const handle = this._notificationService.prompt(
				Severity.Info,
				message,
				Object.entries(buttons).map(([label, action]) => ({
					label,
					run: () => resolve(action()),
				}))
			);
			Event.once(handle.onDidClose)(() => resolve(undefined));
		});
	}

	/**
	 * Gets the matching model for the MCP server in this context, or
	 * a reason why no model could be selected.
	 */
	private async _getMatchingModelInner(server: IMcpServer, isDuringToolCall: boolean, preferences: MCP.ModelPreferences | undefined): Promise<ModelMatch | string> {
		const config = this.getConfig(server);
		// 1. Ensure the server is allowed to sample in this context
		if (isDuringToolCall && !config.allowedDuringChat && !this._sessionSets.allowedDuringChat.has(server.definition.id)) {
			return config.allowedDuringChat === undefined ? ModelMatch.UnsureAllowedDuringChat : ModelMatch.NotAllowed;
		} else if (!isDuringToolCall && !config.allowedOutsideChat && !this._sessionSets.allowedOutsideChat.has(server.definition.id)) {
			return config.allowedOutsideChat === undefined ? ModelMatch.UnsureAllowedOutsideChat : ModelMatch.NotAllowed;
		}

		// 2. Get the configured models, or the default model(s)
		const foundModelIdsDeep = config.allowedModels?.filter(m => !!this._languageModelsService.lookupLanguageModel(m)) || this._languageModelsService.getLanguageModelIds().filter(m => this._languageModelsService.lookupLanguageModel(m)?.isDefault);

		const foundModelIds = foundModelIdsDeep.flat().sort((a, b) => b.length - a.length); // Sort by length to prefer most specific

		if (!foundModelIds.length) {
			return ModelMatch.NoMatchingModel;
		}

		// 3. If preferences are provided, try to match them from the allowed models
		if (preferences?.hints) {
			const found = mapFindFirst(preferences.hints, hint => foundModelIds.find(model => model.toLowerCase().includes(hint.name!.toLowerCase())));
			if (found) {
				return found;
			}
		}

		return foundModelIds[0]; // Return the first matching model
	}

	private _configKey(server: IMcpServer) {
		return `${server.collection.label}: ${server.definition.label}`;
	}

	public getConfig(server: IMcpServer): IMcpServerSamplingConfiguration {
		return this._getConfig(server).value || {};
	}

	/**
	 * _getConfig reads the sampling config reads the `{ server: data }` mapping
	 * from the appropriate config. We read from the most specific possible
	 * config up to the default configuration location that the MCP server itself
	 * is defined in. We don't go further because then workspace-specific servers
	 * would get in the user settings which is not meaningful and could lead
	 * to confusion.
	 *
	 * todo@connor4312: generalize this for other esttings when we have them
	 */
	private _getConfig(server: IMcpServer) {
		const def = server.readDefinitions().get();
		const mostSpecificConfig = ConfigurationTarget.MEMORY;
		const leastSpecificConfig = def.collection?.configTarget || ConfigurationTarget.USER;
		const key = this._configKey(server);
		const resource = def.collection?.presentation?.origin;

		const configValue = this._configurationService.inspect<Record<string, IMcpServerSamplingConfiguration>>(mcpServerSamplingSection, { resource });
		for (let target = mostSpecificConfig; target >= leastSpecificConfig; target--) {
			const mapping = getConfigValueInTarget(configValue, target);
			const config = mapping?.[key];
			if (config) {
				return { value: config, key, mapping, target, resource };
			}
		}

		return { value: undefined, mapping: getConfigValueInTarget(configValue, leastSpecificConfig), key, target: leastSpecificConfig, resource };
	}

	public async updateConfig(server: IMcpServer, mutate: (r: IMcpServerSamplingConfiguration) => unknown) {
		const { value, mapping, key, target, resource } = this._getConfig(server);

		const newConfig = { ...value };
		mutate(newConfig);

		await this._configurationService.updateValue(
			mcpServerSamplingSection,
			{ ...mapping, [key]: newConfig },
			{ resource },
			target,
		);
		return newConfig;
	}
}
