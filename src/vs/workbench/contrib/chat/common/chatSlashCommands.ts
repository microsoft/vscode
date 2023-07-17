/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IProgressService, Progress, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ChatMessageRole, IChatMessage, IChatProviderService, IChatResponseFragment } from 'vs/workbench/contrib/chat/common/chatProvider';
import { IExtensionService, isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

//#region extension point

const slashItem: IJSONSchema = {
	type: 'object',
	required: ['name', 'detail'],
	properties: {
		name: {
			type: 'string',
			markdownDescription: localize('name', "The name of the slash command which will be used as prefix.")
		},
		detail: {
			type: 'string',
			markdownDescription: localize('details', "The details of the slash command.")
		},
	}
};

const slashItems: IJSONSchema = {
	description: localize('vscode.extension.contributes.slashes', "Contributes slash commands to chat"),
	oneOf: [
		slashItem,
		{
			type: 'array',
			items: slashItem
		}
	]
};

export const slashesExtPoint = ExtensionsRegistry.registerExtensionPoint<IChatSlashData[]>({
	extensionPoint: 'slashes',
	jsonSchema: slashItems
});

//#region slash service, commands etc

export interface IChatSlashData {
	id: string;
	name: string;
	detail: string;
}

export interface IChatSlashFragment {
	content: string;
}

export type IChatSlashCallback = { (prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<void> };

export const IChatSlashCommandService = createDecorator<IChatSlashCommandService>('chatSlashCommandService');

export interface IChatSlashCommandService {
	_serviceBrand: undefined;
	registerSlashData(data: IChatSlashData): IDisposable;
	registerSlashCallback(id: string, command: IChatSlashCallback): IDisposable;
	executeCommand(id: string, prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<void>;
	getCommands(): Array<IChatSlashData>;
	hasCommand(id: string): boolean;
}

type Tuple = { data: IChatSlashData; command?: IChatSlashCallback };

export class ChatSlashCommandService implements IChatSlashCommandService {

	declare _serviceBrand: undefined;

	private readonly _commands = new Map<string, Tuple>();

	constructor(@IExtensionService private readonly _extensionService: IExtensionService) {

		const contributions = new DisposableStore();

		slashesExtPoint.setHandler(extensions => {
			contributions.clear();

			for (const entry of extensions) {
				if (!isProposedApiEnabled(entry.description, 'chatSlashCommands')) {
					entry.collector.error(`The ${slashesExtPoint.name} is proposed API`);
					continue;
				}

				const { value } = entry;

				for (const candidate of Iterable.wrap(value)) {
					contributions.add(this.registerSlashData({ ...candidate, id: candidate.name }));
				}
			}
		});
	}

	dispose(): void {
		this._commands.clear();
	}

	registerSlashData(data: IChatSlashData): IDisposable {
		if (this._commands.has(data.id)) {
			throw new Error(`Already registered a command with id ${data.id}}`);
		}
		this._commands.set(data.id, { data });
		return toDisposable(() => this._commands.delete(data.id));
	}

	registerSlashCallback(id: string, command: IChatSlashCallback): IDisposable {
		const data = this._commands.get(id);
		if (!data) {
			throw new Error(`No command with id ${id} registered`);
		}
		data.command = command;
		return toDisposable(() => data.command = undefined);
	}

	getCommands(): Array<IChatSlashData> {
		return Array.from(this._commands.values(), v => v.data);
	}

	hasCommand(id: string): boolean {
		return this._commands.has(id);
	}

	async executeCommand(id: string, prompt: string, progress: IProgress<IChatSlashFragment>, history: IChatMessage[], token: CancellationToken): Promise<void> {
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

		await data.command(prompt, progress, history, token);
	}
}


// --- debug

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'chatbot.helloWorld',
			title: 'Hello World',
			category: 'Chatbot',
			menu: { id: MenuId.CommandPalette }
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const chatProvider = accessor.get(IChatProviderService);

		const p = new Progress<IChatResponseFragment>(value => {
			console.log(value);
		});
		await chatProvider.fetchChatResponse([{ role: ChatMessageRole.User, content: 'Hello.' }], { n: 2 }, p, CancellationToken.None);

	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'chatbot.helloWorld',
			title: 'Slashes for the Masses',
			category: 'Chatbot',
			menu: { id: MenuId.CommandPalette }
		});
	}

	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const quickPick = accessor.get(IQuickInputService);
		const slashCommandService = accessor.get(IChatSlashCommandService);
		const progress = accessor.get(IProgressService);

		const items: (IQuickPickItem & { cmd: IChatSlashData })[] = [];
		for (const cmd of slashCommandService.getCommands()) {
			items.push({
				cmd,
				label: cmd.name,
				detail: cmd.detail
			});
		}

		const pick = await quickPick.pick(items, { placeHolder: 'Pick a command' });

		if (!pick) {
			return;
		}

		const value = `/${pick.cmd.name} `;
		const prompt = await quickPick.input({ value: value, valueSelection: [value.length, value.length], placeHolder: 'Enter a prompt' });

		if (!prompt) {
			return;
		}

		const cts = new CancellationTokenSource();

		progress.withProgress({
			location: ProgressLocation.Notification,
			title: `${prompt}`,
			cancellable: true,
		}, async p => {

			const task = slashCommandService.executeCommand(
				pick.cmd.id,
				prompt,
				new Progress<IChatSlashFragment>(value => {
					p.report({ message: value.content });
					console.log(value);
				}),
				[],
				cts.token
			);

			await task;
		}, () => cts.cancel());

	}
});
