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

export interface IChatRequestVariableValue {
	level: 'short' | 'medium' | 'full';
	value: string;
	description?: string;
}

export interface IChatVariableResolver {
	// TODO should we spec "zoom level"
	(messageText: string, token: CancellationToken): Promise<IChatRequestVariableValue[] | undefined>;
}

export const IChatVariablesService = createDecorator<IChatVariablesService>('IChatVariablesService');

export interface IChatVariablesService {
	_serviceBrand: undefined;
	registerVariable(data: IChatVariableData, resolver: IChatVariableResolver): IDisposable;
	getVariables(): Iterable<Readonly<IChatVariableData>>;

	/**
	 * Resolves all variables that occur in `prompt`
	 */
	resolveVariables(prompt: string, token: CancellationToken): Promise<Record<string, IChatRequestVariableValue[]>>;
}

type ChatData = [data: IChatVariableData, resolver: IChatVariableResolver];

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, ChatData>();

	constructor() {
	}

	async resolveVariables(prompt: string, token: CancellationToken): Promise<Record<string, IChatRequestVariableValue[]>> {
		const resolvedVariables: Record<string, IChatRequestVariableValue[]> = {};
		const jobs: Promise<any>[] = [];

		const regex = /(^|\s)@(\w+)(\s|$)/ig;

		let match: RegExpMatchArray | null;
		while (match = regex.exec(prompt)) {
			const candidate = match[2];
			const data = this._resolver.get(candidate.toLowerCase());
			if (data) {
				jobs.push(data[1](prompt, token).then(value => {
					if (value) {
						resolvedVariables[candidate] = value;
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
}
