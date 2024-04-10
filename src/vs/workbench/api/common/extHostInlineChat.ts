/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostInlineChatShape, IInlineChatResponseDto, IMainContext, MainContext, MainThreadInlineChatShape } from 'vs/workbench/api/common/extHost.protocol';
import { ApiCommand, ApiCommandArgument, ApiCommandResult, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IInlineChatFollowup, IInlineChatRequest, IInlineChatSession, InlineChatResponseFeedbackKind, InlineChatResponseType } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import type * as vscode from 'vscode';

class ProviderWrapper {

	private static _pool = 0;

	readonly handle: number = ProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: vscode.InteractiveEditorSessionProvider
	) { }
}

class SessionWrapper {

	readonly responses: (vscode.InteractiveEditorResponse | vscode.InteractiveEditorMessageResponse)[] = [];

	constructor(
		readonly session: vscode.InteractiveEditorSession
	) { }
}

export class ExtHostInteractiveEditor implements ExtHostInlineChatShape {

	private static _nextId = 0;

	private readonly _inputProvider = new Map<number, ProviderWrapper>();
	private readonly _inputSessions = new Map<number, SessionWrapper>();
	private readonly _proxy: MainThreadInlineChatShape;

	constructor(
		mainContext: IMainContext,
		extHostCommands: ExtHostCommands,
		private readonly _documents: ExtHostDocuments,
		private readonly _logService: ILogService,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadInlineChat);

		type EditorChatApiArg = {
			initialRange?: vscode.Range;
			initialSelection?: vscode.Selection;
			message?: string;
			autoSend?: boolean;
			position?: vscode.Position;
		};

		type InteractiveEditorRunOptions = {
			initialRange?: IRange;
			initialSelection?: ISelection;
			message?: string;
			autoSend?: boolean;
			position?: IPosition;
		};

		extHostCommands.registerApiCommand(new ApiCommand(
			'vscode.editorChat.start', 'inlineChat.start', 'Invoke a new editor chat session',
			[new ApiCommandArgument<EditorChatApiArg | undefined, InteractiveEditorRunOptions | undefined>('Run arguments', '', _v => true, v => {

				if (!v) {
					return undefined;
				}

				return {
					initialRange: v.initialRange ? typeConvert.Range.from(v.initialRange) : undefined,
					initialSelection: extHostTypes.Selection.isSelection(v.initialSelection) ? typeConvert.Selection.from(v.initialSelection) : undefined,
					message: v.message,
					autoSend: v.autoSend,
					position: v.position ? typeConvert.Position.from(v.position) : undefined,
				};
			})],
			ApiCommandResult.Void
		));
	}

	registerProvider(extension: Readonly<IRelaxedExtensionDescription>, provider: vscode.InteractiveEditorSessionProvider, metadata?: vscode.InteractiveEditorSessionProviderMetadata): vscode.Disposable {
		const wrapper = new ProviderWrapper(extension, provider);
		this._inputProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerInteractiveEditorProvider(wrapper.handle, metadata?.label ?? extension.displayName ?? extension.name, extension.identifier, typeof provider.handleInteractiveEditorResponseFeedback === 'function', typeof provider.provideFollowups === 'function', metadata?.supportReportIssue ?? false);
		return toDisposable(() => {
			this._proxy.$unregisterInteractiveEditorProvider(wrapper.handle);
			this._inputProvider.delete(wrapper.handle);
		});
	}

	async $prepareSession(handle: number, uri: UriComponents, range: ISelection, token: CancellationToken): Promise<IInlineChatSession | undefined> {
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
			input: session.input,
			slashCommands: session.slashCommands?.map(c => ({ command: c.command, detail: c.detail, refer: c.refer, executeImmediately: c.executeImmediately })),
			wholeRange: typeConvert.Range.from(session.wholeRange),
			message: session.message
		};
	}

	async $provideResponse(handle: number, item: IInlineChatSession, request: IInlineChatRequest, token: CancellationToken): Promise<IInlineChatResponseDto | undefined> {
		const entry = this._inputProvider.get(handle);
		if (!entry) {
			return undefined;
		}
		const sessionData = this._inputSessions.get(item.id);
		if (!sessionData) {
			return;
		}

		const apiRequest: vscode.InteractiveEditorRequest = {
			prompt: request.prompt,
			selection: typeConvert.Selection.to(request.selection),
			wholeRange: typeConvert.Range.to(request.wholeRange),
			attempt: request.attempt,
			live: request.live,
			previewDocument: this._documents.getDocument(URI.revive(request.previewDocument)),
			withIntentDetection: request.withIntentDetection,
		};


		let done = false;
		const progress: vscode.Progress<vscode.InteractiveEditorProgressItem> = {
			report: async value => {
				if (!request.live && value.edits?.length) {
					throw new Error('Progress reporting is only supported for live sessions');
				}
				if (done || token.isCancellationRequested) {
					return;
				}
				await this._proxy.$handleProgressChunk(request.requestId, {
					message: value.message,
					edits: value.edits?.map(typeConvert.TextEdit.from),
					editsShouldBeInstant: value.editsShouldBeInstant,
					slashCommand: value.slashCommand?.command,
					markdownFragment: extHostTypes.MarkdownString.isMarkdownString(value.content) ? value.content.value : value.content
				});
			}
		};

		const task = Promise.resolve(entry.provider.provideInteractiveEditorResponse(sessionData.session, apiRequest, progress, token));

		let res: vscode.InteractiveEditorResponse | vscode.InteractiveEditorMessageResponse | null | undefined;
		try {
			res = await raceCancellation(task, token);
		} finally {
			done = true;
		}

		if (!res) {
			return undefined;
		}


		const id = sessionData.responses.push(res) - 1;

		const stub: Partial<IInlineChatResponseDto> = {
			wholeRange: typeConvert.Range.from(res.wholeRange),
			placeholder: res.placeholder,
		};

		if (!ExtHostInteractiveEditor._isEditResponse(res)) {
			return {
				...stub,
				id,
				type: InlineChatResponseType.EditorEdit,
				message: typeConvert.MarkdownString.from(res.contents),
				edits: []
			};
		}

		const { edits, contents } = res;
		const message = contents !== undefined ? typeConvert.MarkdownString.from(contents) : undefined;
		if (edits instanceof extHostTypes.WorkspaceEdit) {
			return {
				...stub,
				id,
				type: InlineChatResponseType.BulkEdit,
				edits: typeConvert.WorkspaceEdit.from(edits),
				message
			};

		} else {
			return {
				...stub,
				id,
				type: InlineChatResponseType.EditorEdit,
				edits: (<vscode.TextEdit[]>edits).map(typeConvert.TextEdit.from),
				message
			};
		}
	}

	async $provideFollowups(handle: number, sessionId: number, responseId: number, token: CancellationToken): Promise<IInlineChatFollowup[] | undefined> {
		const entry = this._inputProvider.get(handle);
		const sessionData = this._inputSessions.get(sessionId);
		const response = sessionData?.responses[responseId];
		if (entry && response && entry.provider.provideFollowups) {
			const task = Promise.resolve(entry.provider.provideFollowups(sessionData.session, response, token));
			const followups = await raceCancellation(task, token);
			return followups?.map(typeConvert.ChatInlineFollowup.from);
		}
		return undefined;
	}


	$handleFeedback(handle: number, sessionId: number, responseId: number, kind: InlineChatResponseFeedbackKind): void {
		const entry = this._inputProvider.get(handle);
		const sessionData = this._inputSessions.get(sessionId);
		const response = sessionData?.responses[responseId];
		if (entry && response) {
			const apiKind = typeConvert.InteractiveEditorResponseFeedbackKind.to(kind);
			entry.provider.handleInteractiveEditorResponseFeedback?.(sessionData.session, response, apiKind);
		}
	}

	$releaseSession(handle: number, sessionId: number) {
		// TODO@jrieken remove this
	}

	private static _isEditResponse(thing: any): thing is vscode.InteractiveEditorResponse {
		return typeof thing === 'object' && typeof (<vscode.InteractiveEditorResponse>thing).edits === 'object';
	}
}
