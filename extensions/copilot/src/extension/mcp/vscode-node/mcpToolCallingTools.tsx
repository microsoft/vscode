/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { JsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { CancellationError } from '../../../util/vs/base/common/errors';

export class McpPickRef {
	public _inner?: { type: 'pick'; value: vscode.QuickPick<vscode.QuickPickItem> } | { type: 'input'; value: vscode.InputBox };
	private _isDisposed = false;

	public readonly picks: {
		id: string;
		title: string;
		choice: string;
	}[] = [];

	constructor(private _inputBarrier: Promise<void>) {
		this._inputBarrier.then(() => {

			if (!this._inner && !this._isDisposed) {
				this.getPick().show();
				this.reset(); // mark as "thinking"
			}
		});
	}

	public async pick() {
		await this._inputBarrier;
		const pick = this.getPick();
		pick.busy = false;
		return pick;
	}

	public async input() {
		await this._inputBarrier;
		const input = this.getInput();
		input.busy = false;
		return input;
	}

	public reset() {
		if (!this._inner) {
			return;
		}

		if (this._inner.type === 'pick') {
			this._inner.value.items = [];
		} else {
			this._inner.value.value = '';
		}

		this._inner.value.title = '🤔';
		this._inner.value.placeholder = 'Thinking...';
		this._inner.value.busy = true;
	}

	public dispose() {
		this._inner?.value.dispose();
		this._isDisposed = true;
	}

	private getInput() {
		if (this._inner?.type !== 'input') {
			this._inner?.value.dispose();

			const input = vscode.window.createInputBox();
			input.ignoreFocusOut = true;
			this._inner = { type: 'input', value: input };
		}

		return this._inner.value;
	}

	private getPick() {
		if (this._inner?.type !== 'pick') {
			this._inner?.value.dispose();

			const pick = vscode.window.createQuickPick();
			pick.ignoreFocusOut = true;
			this._inner = { type: 'pick', value: pick };
		}

		return this._inner.value;
	}
}

interface IQuickInputToolArgs {
	id: string;
	title: string;
	placeholder?: string;
	value?: string;
}

export class QuickInputTool {
	public static readonly ID = 'getInput';
	public static readonly description = 'Prompts the user for a short string input.';
	public static readonly schema: JsonSchema = {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: 'An alphanumeric identifier for the input.',
			},
			title: {
				type: 'string',
				description: 'The title of the input box.',
			},
			placeholder: {
				type: 'string',
				description: 'The placeholder text for the input box.',
			},
			value: {
				type: 'string',
				description: 'The default value of the input box.',
			},
		},
		required: ['title', 'id'],
	};

	public static async invoke(ref: McpPickRef, args: IQuickInputToolArgs): Promise<vscode.LanguageModelToolResult> {
		const input = await ref.input();
		input.title = args.title;
		input.placeholder = args.placeholder;
		if (args.value) {
			input.value = args.value;
		}
		input.ignoreFocusOut = true;

		const result = await new Promise<string | undefined>((resolve) => {
			input.onDidAccept(() => {
				const value = input.value;
				resolve(value);
			});

			input.onDidHide(() => {
				resolve(undefined);
			});

			input.show();
		});

		ref.reset();

		if (result === undefined) {
			throw new CancellationError();
		}

		ref.picks.push({ id: args.id, title: args.title, choice: result });
		return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`${args.title}: ${result}`)]);
	}
}

interface IQuickPickToolArgs {
	title: string;
	placeholder?: string;
	canPickMany?: boolean;
	choices: { label: string; description?: string }[];
}

export class QuickPickTool {
	public static readonly ID = 'getChoice';
	public static readonly description = 'Prompts the user to select from a list of choices. It returns the label or labels of the choices that were selected';
	public static readonly schema: JsonSchema = {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'The title of the pick box.',
			},
			placeholder: {
				type: 'string',
				description: 'The placeholder text for the pick box.',
			},
			canPickMany: {
				type: 'boolean',
				description: 'If true, the user can select multiple choices.',
			},
			choices: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						label: { type: 'string', description: 'The primary label of the choice of the choice.' },
						description: { type: 'string', description: 'A brief extra description.' },
					}
				},
				minItems: 1,
			},
		},
		required: ['title', 'choices'],
	};

	public static async invoke(ref: McpPickRef, args: IQuickPickToolArgs): Promise<vscode.LanguageModelToolResult> {
		const pick = await ref.pick();
		pick.title = args.title;
		pick.placeholder = args.placeholder;
		pick.items = args.choices;
		pick.canSelectMany = args.canPickMany ?? false;
		pick.ignoreFocusOut = true;

		let result = await new Promise<string | string[] | undefined>((resolve) => {
			pick.onDidAccept(() => {
				const value = args.canPickMany ? pick.selectedItems.map(i => i.label) : pick.selectedItems[0]?.label;
				resolve(value);
			});

			pick.onDidHide(() => {
				resolve(undefined);
			});

			pick.show();
		});

		ref.reset();

		if (result === undefined) {
			throw new CancellationError();
		}
		if (Array.isArray(result)) {
			result = '- ' + result.join('\n- ');
		}

		return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(`${args.title}: ${result}`)]);
	}
}
