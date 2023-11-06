/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';
import { IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { IChatFollowup, IChatResponseProgressFileTreeData } from 'vs/workbench/contrib/chat/common/chatService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

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
}

export interface IChatSlashFragment {
	content: string | { treeData: IChatResponseProgressFileTreeData };
}

export type IChatSlashCallback = { (prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void> };

export const IChatSlashCommandService = createDecorator<IChatSlashCommandService>('chatSlashCommandService');

/**
 * This currently only exists to drive /clear. Delete this when the agent service can handle that scenario
 */
export interface IChatSlashCommandService {
	_serviceBrand: undefined;
	readonly onDidChangeCommands: Event<void>;
	registerSlashData(data: IChatSlashData): IDisposable;
	registerSlashCallback(id: string, command: IChatSlashCallback): IDisposable;
	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable;
	executeCommand(id: string, prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void>;
	getCommands(): Array<IChatSlashData>;
	hasCommand(id: string): boolean;
}

type Tuple = { data: IChatSlashData; command?: IChatSlashCallback };

export class ChatSlashCommandService extends Disposable implements IChatSlashCommandService {

	declare _serviceBrand: undefined;

	private readonly _commands = new Map<string, Tuple>();

	private readonly _onDidChangeCommands = this._register(new Emitter<void>());
	readonly onDidChangeCommands: Event<void> = this._onDidChangeCommands.event;

	constructor(@IExtensionService private readonly _extensionService: IExtensionService) {
		super();
	}

	override dispose(): void {
		super.dispose();
		this._commands.clear();
	}

	registerSlashData(data: IChatSlashData): IDisposable {
		if (this._commands.has(data.command)) {
			throw new Error(`Already registered a command with id ${data.command}}`);
		}
		this._commands.set(data.command, { data });
		this._onDidChangeCommands.fire();

		return toDisposable(() => {
			if (this._commands.delete(data.command)) {
				this._onDidChangeCommands.fire();
			}
		});
	}

	registerSlashCallback(id: string, command: IChatSlashCallback): IDisposable {
		const data = this._commands.get(id);
		if (!data) {
			throw new Error(`No command with id ${id} registered`);
		}
		data.command = command;
		return toDisposable(() => data.command = undefined);
	}

	registerSlashCommand(data: IChatSlashData, command: IChatSlashCallback): IDisposable {
		return combinedDisposable(
			this.registerSlashData(data),
			this.registerSlashCallback(data.command, command)
		);
	}

	getCommands(): Array<IChatSlashData> {
		return Array.from(this._commands.values(), v => v.data);
	}

	hasCommand(id: string): boolean {
		return this._commands.has(id);
	}

	async executeCommand(id: string, prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<{ followUp: IChatFollowup[] } | void> {
		const data = this._commands.get(id);
		if (!data) {
			throw new Error('No command with id ${id} NOT registered');
		}
		if (!data.command) {
			await this._extensionService.activateByEvent(`onSlash:${id}`);
		}
		if (!data.command) {
			throw new Error(`No command with id ${id} NOT resolved`);
		}

		return await data.command(prompt, progress, history, token);
	}
}
