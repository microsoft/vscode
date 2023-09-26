/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestVariablePart, IParsedChatRequest, chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';

export interface IChatVariableData {
	name: string;
	description: string;
	hidden?: boolean;
	canTakeArgument?: boolean;
}

export interface IChatRequestVariableValue {
	level: 'short' | 'medium' | 'full';
	value: string;
	description?: string;
}

export interface IChatVariableResolver {
	// TODO should we spec "zoom level"
	(messageText: string, arg: string | undefined, model: IChatModel, token: CancellationToken): Promise<IChatRequestVariableValue[] | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable;
	hasVariable(name: string): boolean;
	getVariables(): Iterable<Readonly<IChatVariableData>>;

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: IParsedChatRequest, model: IChatModel, token: CancellationToken): Promise<IChatVariableResolveResult>;
}

interface IChatData {
	data: IChatVariableData;
	resolver: IChatVariableResolver;
}

interface IChatVariableResolveResult {
	variables: Record<string, IChatRequestVariableValue[]>;
	prompt: string;
}

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, IChatData>();

	constructor() {
	}

	async resolveVariables(prompt: IParsedChatRequest, model: IChatModel, token: CancellationToken): Promise<IChatVariableResolveResult> {
		const resolvedVariables: Record<string, IChatRequestVariableValue[]> = {};
		const jobs: Promise<any>[] = [];

		const parsedPrompt: string[] = [];
		prompt.parts
			.forEach((varPart, i) => {
				if (varPart instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(varPart.variableName.toLowerCase());
					if (data) {
						jobs.push(data.resolver(prompt.text, varPart.variableArg, model, token).then(value => {
							if (value) {
								resolvedVariables[varPart.variableName] = value;
								parsedPrompt[i] = `[${chatVariableLeader}${varPart.variableName}](values:${varPart.variableName})`;
							} else {
								parsedPrompt[i] = varPart.text;
							}
						}).catch(onUnexpectedExternalError));
					}
				} else {
					parsedPrompt[i] = varPart.text;
				}
			});

		await Promise.allSettled(jobs);

		return {
			variables: resolvedVariables,
			prompt: parsedPrompt.join('')
		};
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => !data.hidden);
	}

	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable {
		const key = data.name.toLowerCase();
		if (this._resolver.has(key)) {
			throw new Error(`A chat variable with the name '${data.name}' already exists.`);
		}
		this._resolver.set(key, { data, resolver });
		return toDisposable(() => {
			this._resolver.delete(key);
		});
	}
}
