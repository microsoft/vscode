/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ISelection } from 'vs/editor/common/core/selection';
import { IInteractiveEditorResponse, IInteractiveEditorSession, IInteractiveEditorRequest } from 'vs/editor/contrib/interactive/common/interactiveEditor';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostInteractiveEditorShape, IMainContext, MainContext, MainThreadInteractiveEditorShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';

class ProviderWrapper {

	private static _pool = 0;

	readonly handle: number = ProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: vscode.InteractiveEditorSessionProvider,
	) { }
}

export class ExtHostInteractiveEditor implements ExtHostInteractiveEditorShape {

	private static _nextId = 0;

	private readonly _inputProvider = new Map<number, ProviderWrapper>();
	private readonly _inputSessions = new Map<number, vscode.InteractiveEditorSession>();
	private readonly _proxy: MainThreadInteractiveEditorShape;

	constructor(
		mainContext: IMainContext,
		private readonly _documents: ExtHostDocuments,
		private readonly _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadInteractiveEditor);
	}

	registerProvider(extension: Readonly<IRelaxedExtensionDescription>, provider: vscode.InteractiveEditorSessionProvider): vscode.Disposable {
		const wrapper = new ProviderWrapper(extension, provider);
		this._inputProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerInteractiveEditorProvider(wrapper.handle, extension.identifier.value);
		return toDisposable(() => {
			this._proxy.$unregisterInteractiveEditorProvider(wrapper.handle);
			this._inputProvider.delete(wrapper.handle);
		});
	}

	async $prepareInteractiveSession(handle: number, uri: UriComponents, range: ISelection, token: CancellationToken): Promise<IInteractiveEditorSession | undefined> {
		const entry = this._inputProvider.get(handle);
		if (!entry) {
			this._logService.warn('CANNOT prepare session because the PROVIDER IS GONE');
			return undefined;
		}

		const document = this._documents.getDocument(URI.revive(uri));
		const session = await entry.provider.prepareInteractiveEditorSession({ document, selection: typeConvert.Selection.to(range) }, token);
		if (!session) {
			return undefined;
		}

		const id = ExtHostInteractiveEditor._nextId++;
		this._inputSessions.set(id, session);

		return { id, placeholder: session.placeholder };
	}

	async $provideResponse(handle: number, item: IInteractiveEditorSession, request: IInteractiveEditorRequest, token: CancellationToken): Promise<IInteractiveEditorResponse | undefined> {
		const entry = this._inputProvider.get(handle);
		if (!entry) {
			return undefined;
		}
		const session = this._inputSessions.get(item.id);
		if (!session) {
			return;
		}

		const res = await entry.provider.provideInteractiveEditorResponse({
			session,
			prompt: request.prompt,
			selection: typeConvert.Selection.to(request.selection),
			wholeRange: typeConvert.Range.to(request.wholeRange)
		}, token);

		if (!res) {
			return;
		}

		return {
			edits: res.edits.map(typeConvert.TextEdit.from),
			placeholder: res.placeholder
		};
	}

	$releaseSession(handle: number, sessionId: number) {
		const session = this._inputSessions.get(sessionId);
		const entry = this._inputProvider.get(handle);
		if (session && entry) {
			entry.provider.releaseInteractiveEditorSession?.(session);
		}
		this._inputSessions.delete(sessionId);
	}

}
