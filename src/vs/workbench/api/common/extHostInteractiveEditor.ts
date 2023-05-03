/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ISelection } from 'vs/editor/common/core/selection';
import { IInteractiveEditorSession, IInteractiveEditorRequest, InteractiveEditorResponseFeedbackKind, InteractiveEditorResponseType } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostInteractiveEditorShape, IInteractiveEditorResponseDto, IMainContext, MainContext, MainThreadInteractiveEditorShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import type * as vscode from 'vscode';

class ProviderWrapper {

	private static _pool = 0;

	readonly handle: number = ProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: vscode.InteractiveEditorSessionProvider,
	) { }
}

class SessionWrapper {

	readonly responses: (vscode.InteractiveEditorResponse | vscode.InteractiveEditorMessageResponse)[] = [];

	constructor(
		readonly session: vscode.InteractiveEditorSession
	) { }
}

export class ExtHostInteractiveEditor implements ExtHostInteractiveEditorShape {

	private static _nextId = 0;

	private readonly _inputProvider = new Map<number, ProviderWrapper>();
	private readonly _inputSessions = new Map<number, SessionWrapper>();
	private readonly _proxy: MainThreadInteractiveEditorShape;

	constructor(
		mainContext: IMainContext,
		private readonly _documents: ExtHostDocuments,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadInteractiveEditor);
	}

	registerProvider(extension: Readonly<IRelaxedExtensionDescription>, provider: vscode.InteractiveEditorSessionProvider): vscode.Disposable {
		const wrapper = new ProviderWrapper(extension, provider);
		this._inputProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerInteractiveEditorProvider(wrapper.handle, extension.identifier.value, typeof provider.handleInteractiveEditorResponseFeedback === 'function');
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
		const selection = typeConvert.Selection.to(range);
		const session = await entry.provider.prepareInteractiveEditorSession({ document, selection }, token);
		if (!session) {
			return undefined;
		}

		if (session.wholeRange && !session.wholeRange.contains(selection)) {
			throw new Error(`InteractiveEditorSessionProvider returned a wholeRange that does not contain the selection.`);
		}

		const id = ExtHostInteractiveEditor._nextId++;
		this._inputSessions.set(id, new SessionWrapper(session));

		return {
			id,
			placeholder: session.placeholder,
			slashCommands: session.slashCommands,
			wholeRange: typeConvert.Range.from(session.wholeRange),
		};
	}

	async $provideResponse(handle: number, item: IInteractiveEditorSession, request: IInteractiveEditorRequest, token: CancellationToken): Promise<IInteractiveEditorResponseDto | undefined> {
		const entry = this._inputProvider.get(handle);
		if (!entry) {
			return undefined;
		}
		const sessionData = this._inputSessions.get(item.id);
		if (!sessionData) {
			return;
		}

		const res = await entry.provider.provideInteractiveEditorResponse({
			session: sessionData.session,
			prompt: request.prompt,
			selection: typeConvert.Selection.to(request.selection),
			wholeRange: typeConvert.Range.to(request.wholeRange),
		}, token);

		if (res) {

			const id = sessionData.responses.push(res) - 1;

			const stub: Partial<IInteractiveEditorResponseDto> = {
				wholeRange: typeConvert.Range.from(res.wholeRange),
				placeholder: res.placeholder,
			};

			if (ExtHostInteractiveEditor._isMessageResponse(res)) {
				return {
					...stub,
					id,
					type: InteractiveEditorResponseType.Message,
					message: typeConvert.MarkdownString.from(res.contents),
				};
			}

			const { edits } = res;
			if (edits instanceof extHostTypes.WorkspaceEdit) {
				return {
					...stub,
					id,
					type: InteractiveEditorResponseType.BulkEdit,
					edits: typeConvert.WorkspaceEdit.from(edits),
				};

			} else if (Array.isArray(edits)) {
				return {
					...stub,
					id,
					type: InteractiveEditorResponseType.EditorEdit,
					edits: edits.map(typeConvert.TextEdit.from),
				};
			}
		}

		return undefined;
	}

	$handleFeedback(handle: number, sessionId: number, responseId: number, kind: InteractiveEditorResponseFeedbackKind): void {
		const entry = this._inputProvider.get(handle);
		const sessionData = this._inputSessions.get(sessionId);
		const response = sessionData?.responses[responseId];

		if (entry && response) {
			// todo@jrieken move to type converter
			let apiKind: extHostTypes.InteractiveEditorResponseFeedbackKind;
			switch (kind) {
				case InteractiveEditorResponseFeedbackKind.Helpful:
					apiKind = extHostTypes.InteractiveEditorResponseFeedbackKind.Helpful;
					break;
				case InteractiveEditorResponseFeedbackKind.Unhelpful:
					apiKind = extHostTypes.InteractiveEditorResponseFeedbackKind.Unhelpful;
					break;
				case InteractiveEditorResponseFeedbackKind.Undone:
					apiKind = extHostTypes.InteractiveEditorResponseFeedbackKind.Undone;
					break;
			}

			entry.provider.handleInteractiveEditorResponseFeedback?.(sessionData.session, response, apiKind);
		}
	}

	$releaseSession(handle: number, sessionId: number) {
		const sessionData = this._inputSessions.get(sessionId);
		const entry = this._inputProvider.get(handle);
		if (sessionData && entry) {
			entry.provider.releaseInteractiveEditorSession?.(sessionData.session);
		}
		this._inputSessions.delete(sessionId);
	}

	private static _isMessageResponse(thing: any): thing is vscode.InteractiveEditorMessageResponse {
		return typeof thing === 'object' && typeof (<vscode.InteractiveEditorMessageResponse>thing).contents === 'object';
	}
}
