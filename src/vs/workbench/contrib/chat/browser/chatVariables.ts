/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatDynamicVariableModel } from 'vs/workbench/contrib/chat/browser/contrib/chatDynamicVariables';
import { IChatModel, IChatRequestVariableData } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest, ChatRequestVariablePart, ChatRequestDynamicVariablePart } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatVariablesService, IChatRequestVariableValue, IChatVariableData, IChatVariableResolver, IDynamicVariable } from 'vs/workbench/contrib/chat/common/chatVariables';

interface IChatData {
	data: IChatVariableData;
	resolver: IChatVariableResolver;
}

export class ChatVariablesService implements IChatVariablesService {
	declare _serviceBrand: undefined;

	private _resolver = new Map<string, IChatData>();

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService
	) {
	}

	async resolveVariables(prompt: IParsedChatRequest, model: IChatModel, token: CancellationToken): Promise<IChatRequestVariableData> {
		const resolvedVariables: Record<string, IChatRequestVariableValue[]> = {};
		const jobs: Promise<any>[] = [];

		const parsedPrompt: string[] = [];
		prompt.parts
			.forEach((part, i) => {
				if (part instanceof ChatRequestVariablePart) {
					const data = this._resolver.get(part.variableName.toLowerCase());
					if (data) {
						jobs.push(data.resolver(prompt.text, part.variableArg, model, token).then(value => {
							if (value) {
								resolvedVariables[part.variableName] = value;
								parsedPrompt[i] = `[${part.text}](values:${part.variableName})`;
							} else {
								parsedPrompt[i] = part.promptText;
							}
						}).catch(onUnexpectedExternalError));
					}
				} else if (part instanceof ChatRequestDynamicVariablePart) {
					const referenceName = this.getUniqueReferenceName(part.referenceText, resolvedVariables);
					resolvedVariables[referenceName] = part.data;
					const safeText = part.text.replace(/[\[\]]/g, '_');
					const safeTarget = referenceName.replace(/[\(\)]/g, '_');
					parsedPrompt[i] = `[${safeText}](values:${safeTarget})`;
				} else {
					parsedPrompt[i] = part.promptText;
				}
			});

		await Promise.allSettled(jobs);

		return {
			variables: resolvedVariables,
			message: parsedPrompt.join('').trim()
		};
	}

	private getUniqueReferenceName(name: string, vars: Record<string, any>): string {
		let i = 1;
		while (vars[name]) {
			name = `${name}_${i++}`;
		}
		return name;
	}

	hasVariable(name: string): boolean {
		return this._resolver.has(name.toLowerCase());
	}

	getVariables(): Iterable<Readonly<IChatVariableData>> {
		const all = Iterable.map(this._resolver.values(), data => data.data);
		return Iterable.filter(all, data => !data.hidden);
	}

	getDynamicVariables(sessionId: string): ReadonlyArray<IDynamicVariable> {
		// This is slightly wrong... the parser pulls dynamic references from the input widget, but there is no guarantee that message came from the input here.
		// Need to ...
		// - Parser takes list of dynamic references (annoying)
		// - Or the parser is known to implicitly act on the input widget, and we need to call it before calling the chat service (maybe incompatible with the future, but easy)
		const widget = this.chatWidgetService.getWidgetBySessionId(sessionId);
		if (!widget || !widget.viewModel || !widget.supportsFileReferences) {
			return [];
		}

		const model = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!model) {
			return [];
		}

		return model.variables;
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
