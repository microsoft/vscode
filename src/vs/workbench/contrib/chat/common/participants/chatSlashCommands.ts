/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { IChatMessage } from '../languageModels.js';
import { IChatFollowup, IChatProgress, IChatResponseProgressFileTreeData, IChatSendRequestOptions } from '../chatService/chatService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
import { URI } from '../../../../../base/common/uri.js';
import { getChatSessionType } from '../model/chatUri.js';
import { matchesSessionType } from '../promptSyntax/service/promptsService.js';

//#region slash service, commands etc

export interface IChatSlashData {
	command: string;
	detail: string;
	sortText?: string;
	/**
	 * Whether the command should execute as soon
	 * as it is entered. Defaults to `false`.
	 */
	executeImmediately?: boolean;

	/**
	 * Whether the command should be added as a request/response
	 * turn to the chat history. Defaults to `false`.
	 *
	 * For instance, the `/save` command opens an untitled document
	 * to the side hence does not contain any chatbot responses.
	 */
	silent?: boolean;

	locations: ChatAgentLocation[];
	modes?: ChatModeKind[];
	sessionTypes?: string[];

	/**
	 * Optional context key expression that controls visibility of this command.
	 * When set, the command is only shown if the expression evaluates to true.
	 */
	when?: ContextKeyExpression;
}

export interface IChatSlashFragment {
	content: string | { treeData: IChatResponseProgressFileTreeData };
}
export type IChatSlashCallback = { (prompt: string, progress: IProgress<IChatProgress>, history: IChatMessage[], location: ChatAgentLocation, sessionResource: URI, token: CancellationToken, options?: IChatSendRequestOptions): Promise<{ followUp: IChatFollowup[] } | void> };

export const IChatSlashCommandService = createDecorator<IChatSlashCommandService>('chatSlashCommandService');

/**
 * This currently only exists to drive /clear and /help
 */
export interface IChatSlashCommandService {
	_serviceBrand: undefined;
	readonly onDidChangeCommands: Event<void>;
	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable;
	executeCommand(id: string, prompt: string, progress: IProgress<IChatProgress>, history: IChatMessage[], location: ChatAgentLocation, sessionResource: URI, token: CancellationToken, options?: IChatSendRequestOptions): Promise<{ followUp: IChatFollowup[] } | void>;
	getCommands(location: ChatAgentLocation, mode: ChatModeKind): Array<IChatSlashData>;
	hasCommand(id: string, sessionType: string): boolean;
}

type RegisteredSlashCommand = { data: IChatSlashData; command?: IChatSlashCallback };

export class ChatSlashCommandService extends Disposable implements IChatSlashCommandService {

	declare _serviceBrand: undefined;

	private readonly _commands = new Map<string, RegisteredSlashCommand[]>();

	private readonly _onDidChangeCommands = this._register(new Emitter<void>());
	readonly onDidChangeCommands: Event<void> = this._onDidChangeCommands.event;

	constructor(@IExtensionService private readonly _extensionService: IExtensionService) {
		super();
	}

	override dispose(): void {
		super.dispose();
		this._commands.clear();
	}

	private getSessionScopedCommands(id: string): RegisteredSlashCommand[] {
		return this._commands.get(id) ?? [];
	}

	private commandsOverlap(dataA: IChatSlashData, dataB: IChatSlashData): boolean {
		if (dataA.sessionTypes === undefined || dataB.sessionTypes === undefined) {
			return true;
		}

		return dataA.sessionTypes.some(sessionType => dataB.sessionTypes?.includes(sessionType));
	}

	private getCommand(id: string, sessionType: string | undefined): RegisteredSlashCommand | undefined {
		return this.getSessionScopedCommands(id).find(candidate => matchesSessionType(candidate.data.sessionTypes, sessionType));
	}

	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable {
		const commandsForId = this.getSessionScopedCommands(data.command);
		if (commandsForId.some(candidate => this.commandsOverlap(candidate.data, data))) {
			throw new Error(`Already registered a command with id ${data.command}`);
		}

		const entry = { data, command };
		commandsForId.push(entry);
		this._commands.set(data.command, commandsForId);
		this._onDidChangeCommands.fire();

		return toDisposable(() => {
			const commandsForId = this._commands.get(data.command);
			if (!commandsForId) {
				return;
			}

			const entryIndex = commandsForId.indexOf(entry);
			if (entryIndex === -1) {
				return;
			}

			commandsForId.splice(entryIndex, 1);
			if (commandsForId.length === 0) {
				this._commands.delete(data.command);
			}

			this._onDidChangeCommands.fire();
		});
	}

	getCommands(location: ChatAgentLocation, mode: ChatModeKind): Array<IChatSlashData> {
		return Array
			.from(this._commands.values())
			.flatMap(commands => commands.map(v => v.data))
			.filter(c => c.locations.includes(location) && (!c.modes || c.modes.includes(mode)));
	}

	hasCommand(id: string, sessionType: string): boolean {
		return !!this.getCommand(id, sessionType);
	}

	async executeCommand(id: string, prompt: string, progress: IProgress<IChatProgress>, history: IChatMessage[], location: ChatAgentLocation, sessionResource: URI, token: CancellationToken, options?: IChatSendRequestOptions): Promise<{ followUp: IChatFollowup[] } | void> {
		const data = this.getCommand(id, getChatSessionType(sessionResource));
		if (!data) {
			throw new Error(`No command with id ${id} NOT registered`);
		}
		if (!data.command) {
			await this._extensionService.activateByEvent(`onSlash:${id}`);
		}
		if (!data.command) {
			throw new Error(`No command with id ${id} NOT resolved`);
		}

		return await data.command(prompt, progress, history, location, sessionResource, token, options);
	}
}
