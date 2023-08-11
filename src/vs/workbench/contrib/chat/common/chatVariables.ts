/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IChatVariableData {
	name: string;
	description: string;
}

export interface IChatResolvedVariable {
	// TODO should we allow for multiple levels
	content: string;
}

export interface IChatVariableResolver {
	// TODO should we spec "zoom level"
	(token: CancellationToken): Promise<IChatResolvedVariable | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable;
	getVariables(): Iterable<Readonly<IChatVariableData>>;

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: string, token: CancellationToken): Promise<ReadonlyMap<string, IChatResolvedVariable>>;

	// TODO is this needed?
	resolveVariable(name: string, token: CancellationToken): Promise<IChatResolvedVariable | undefined>;
}

type ChatData = [data: IChatVariableData, resolver: IChatVariableResolver];

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, ChatData>();

	constructor() {
		[
			{ name: 'selection', description: `The current editor's selection` },
			{ name: 'editor', description: 'The current editor' },
			{ name: 'debugConsole', description: 'The output in the debug console' },
			{ name: 'vscodeAPI', description: 'The docs for the vscode extension API' },
			{ name: 'git', description: 'The git details for your workspace' },
			{ name: 'problems', description: 'The problems detected in your workspace' },
			{ name: 'terminal', description: 'The current terminal buffer' },
			{ name: 'terminalSelection', description: 'The current selection in the terminal' },
			{ name: 'workspace', description: 'Details of your workspace' },
			{ name: 'vscode', description: 'Commands and settings in vscode' },
		].forEach(item => {
			this.registerVariable(item, async () => ({ content: item.name }));
		});
	}

	async resolveVariables(prompt: string, token: CancellationToken): Promise<ReadonlyMap<string, IChatResolvedVariable>> {
		const resolvedVariables = new Map<string, IChatResolvedVariable>();
		const jobs: Promise<any>[] = [];

		const regex = /(^|\s)@(\w+)(\s|$)/ig;

		let match: RegExpMatchArray | null;
		while (match = regex.exec(prompt)) {
			const candidate = match[2];
			const data = this._resolver.get(candidate);
			if (data) {
				jobs.push(data[1](token).then(value => {
					if (value) {
						resolvedVariables.set(candidate, value);
					}
				}).catch(onUnexpectedExternalError));
			}
		}

		await Promise.allSettled(jobs);

		return Promise.resolve(resolvedVariables);
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		return Iterable.map(this._resolver.values(), data => data[0]);
	}

	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		const key = data.name.toLowerCase();
		if (this._resolver.has(key)) {
			throw new Error(`A chat variable with the name '${data.name}' already exists.`);
		}
		this._resolver.set(key, [data, resolver]);
		return toDisposable(() => {
			this._resolver.delete(key);
		});
	}

	resolveVariable(name: string, token: CancellationToken): Promise<IChatResolvedVariable | undefined> {
		const key = name.toLowerCase();
		const chatData = this._resolver.get(key);
		if (!chatData) {
			throw new Error(`A chat variable with the name '${name}' does not exist.`);
		}
		const [, resolver] = chatData;
		return Promise.resolve(resolver(token));
	}
}
