/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatAgentService } from './chatAgents.js';
import { ChatContextKeys } from './chatContextKeys.js';
import { ChatMode, modeToString } from './constants.js';
import { ICustomChatMode, IPromptsService } from './promptSyntax/service/promptsService.js';

export const IChatModeService = createDecorator<IChatModeService>('chatModeService');
export interface IChatModeService {
	readonly _serviceBrand: undefined;

	onDidChangeChatModes: Event<void>;
	getModes(): { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] };
	getModesAsync(): Promise<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }>;
}

export class ChatModeService extends Disposable implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	private latestCustomPromptModes: readonly CustomChatMode[] | undefined;
	private readonly hasCustomModes: IContextKey<boolean>;

	private readonly _onDidChangeChatModes = new Emitter<void>();
	public readonly onDidChangeChatModes = this._onDidChangeChatModes.event;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		void this.refreshCustomPromptModes(true);
		this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);
		this._register(this.promptsService.onDidChangeCustomChatModes(() => {
			void this.refreshCustomPromptModes(true);
		}));
	}

	private async refreshCustomPromptModes(fireChangeEvent?: boolean): Promise<void> {
		try {
			const modes = await this.promptsService.getCustomChatModes(CancellationToken.None);
			this.latestCustomPromptModes = modes.map(customMode => new CustomChatMode(customMode));
			this.hasCustomModes.set(modes.length > 0);
			if (fireChangeEvent) {
				this._onDidChangeChatModes.fire();
			}
		} catch (error) {
			this.logService.error(error, 'Failed to load custom chat modes');
			this.latestCustomPromptModes = [];
			this.hasCustomModes.set(false);
		}
	}

	getModes(): { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] } {
		return { builtin: this.getBuiltinModes(), custom: this.latestCustomPromptModes };
	}

	async getModesAsync(): Promise<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }> {
		await this.refreshCustomPromptModes();
		return { builtin: this.getBuiltinModes(), custom: this.latestCustomPromptModes };
	}

	private getBuiltinModes(): IChatMode[] {
		const builtinModes: IChatMode[] = [
			ChatMode2.Ask,
		];

		if (this.chatAgentService.hasToolsAgent) {
			builtinModes.push(ChatMode2.Agent);
		}
		builtinModes.push(ChatMode2.Edit);
		return builtinModes;
	}
}

/**
 * TODO This data object is not quite the right pattern, needs to live-update on file changes
 */
export interface IChatMode {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly kind: ChatMode;
	readonly customTools?: readonly string[];
	readonly body?: string;
}

export function isIChatMode(mode: unknown): mode is IChatMode {
	if (typeof mode === 'object' && mode !== null) {
		const chatMode = mode as IChatMode;
		return typeof chatMode.id === 'string' &&
			typeof chatMode.kind === 'string';
	}

	return false;
}

export class CustomChatMode implements IChatMode {
	get id(): string {
		return this.customChatMode.uri.toString();
	}

	get name(): string {
		return this.customChatMode.name;
	}

	get description(): string | undefined {
		return this.customChatMode.description;
	}

	get customTools(): readonly string[] | undefined {
		return this.customChatMode.tools;
	}

	get body(): string {
		return this.customChatMode.body;
	}

	public readonly kind = ChatMode.Agent;

	constructor(
		private readonly customChatMode: ICustomChatMode
	) { }

	/**
	 * Getters are not json-stringified
	 */
	toJSON(): IChatMode {
		return {
			id: this.id,
			name: this.name,
			description: this.description,
			kind: this.kind,
			customTools: this.customTools,
			body: this.body
		};
	}
}

export class BuiltinChatMode implements IChatMode {
	constructor(
		public readonly kind: ChatMode,
		public readonly description: string
	) { }

	get id(): string {
		// Need a differentiator?
		return this.kind;
	}

	get name(): string {
		return modeToString(this.kind);
	}

	/**
	 * Getters are not json-stringified
	 */
	toJSON(): IChatMode {
		return {
			id: this.id,
			name: this.name,
			description: this.description,
			kind: this.kind
		};
	}
}

export namespace ChatMode2 {
	export const Ask = new BuiltinChatMode(ChatMode.Ask, localize('chatDescription', "Ask Copilot"));
	export const Edit = new BuiltinChatMode(ChatMode.Edit, localize('editsDescription', "Edit files in your workspace"));
	export const Agent = new BuiltinChatMode(ChatMode.Agent, localize('agentDescription', "Edit files in your workspace in agent mode"));
}

export function validateChatMode2(mode: unknown): IChatMode | undefined {
	switch (mode) {
		case ChatMode.Ask:
			return ChatMode2.Ask;
		case ChatMode.Edit:
			return ChatMode2.Edit;
		case ChatMode.Agent:
			return ChatMode2.Agent;
		default:
			if (isIChatMode(mode)) {
				return mode;
			}
			return undefined;
	}
}

export function isBuiltinChatMode(mode: IChatMode): boolean {
	return mode.id === ChatMode2.Ask.id ||
		mode.id === ChatMode2.Edit.id ||
		mode.id === ChatMode2.Agent.id;
}
