/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostChatVariablesShape, IChatVariableResolverProgressDto, IMainContext, MainContext, MainThreadChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatRequestVariableValue, IChatVariableData } from 'vs/workbench/contrib/chat/common/chatVariables';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import type * as vscode from 'vscode';

export class ExtHostChatVariables implements ExtHostChatVariablesShape {

	private static _idPool = 0;

	private readonly _resolver = new Map<number, { extension: IExtensionDescription; data: IChatVariableData; resolver: vscode.ChatVariableResolver }>();
	private readonly _proxy: MainThreadChatVariablesShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatVariables);
	}

	async $resolveVariable(handle: number, requestId: string, messageText: string, token: CancellationToken): Promise<IChatRequestVariableValue[] | undefined> {
		const item = this._resolver.get(handle);
		if (!item) {
			return undefined;
		}
		try {
			if (item.resolver.resolve2) {
				checkProposedApiEnabled(item.extension, 'chatParticipantAdditions');
				const stream = new ChatVariableResolverResponseStream(requestId, this._proxy);
				const value = await item.resolver.resolve2(item.data.name, { prompt: messageText }, stream.apiObject, token);
				if (value) {
					return value.map(typeConvert.ChatVariable.from);
				}
			} else {
				const value = await item.resolver.resolve(item.data.name, { prompt: messageText }, token);
				if (value) {
					return value.map(typeConvert.ChatVariable.from);
				}
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
		return undefined;
	}

	registerVariableResolver(extension: IExtensionDescription, name: string, description: string, resolver: vscode.ChatVariableResolver): IDisposable {
		const handle = ExtHostChatVariables._idPool++;
		this._resolver.set(handle, { extension, data: { name, description }, resolver: resolver });
		this._proxy.$registerVariable(handle, { name, description });

		return toDisposable(() => {
			this._resolver.delete(handle);
			this._proxy.$unregisterVariable(handle);
		});
	}
}

class ChatVariableResolverResponseStream {

	private _isClosed: boolean = false;
	private _apiObject: vscode.ChatVariableResolverResponseStream | undefined;

	constructor(
		private readonly _requestId: string,
		private readonly _proxy: MainThreadChatVariablesShape,
	) { }

	close() {
		this._isClosed = true;
	}

	get apiObject() {
		if (!this._apiObject) {
			const that = this;

			function throwIfDone(source: Function | undefined) {
				if (that._isClosed) {
					const err = new Error('Response stream has been closed');
					Error.captureStackTrace(err, source);
					throw err;
				}
			}

			const _report = (progress: IChatVariableResolverProgressDto) => {
				this._proxy.$handleProgressChunk(this._requestId, progress);
			};

			this._apiObject = {
				progress(value) {
					throwIfDone(this.progress);
					const part = new extHostTypes.ChatResponseProgressPart(value);
					const dto = typeConvert.ChatResponseProgressPart.to(part);
					_report(dto);
					return this;
				},
				reference(value) {
					throwIfDone(this.reference);
					const part = new extHostTypes.ChatResponseReferencePart(value);
					const dto = typeConvert.ChatResponseReferencePart.to(part);
					_report(dto);
					return this;
				},
				push(part) {
					throwIfDone(this.push);

					if (part instanceof extHostTypes.ChatResponseReferencePart) {
						_report(typeConvert.ChatResponseReferencePart.to(part));
					} else if (part instanceof extHostTypes.ChatResponseProgressPart) {
						_report(typeConvert.ChatResponseProgressPart.to(part));
					}

					return this;
				}
			};
		}

		return this._apiObject;
	}
}
