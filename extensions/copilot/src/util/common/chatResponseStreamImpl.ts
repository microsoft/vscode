/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatResponseReferencePartStatusKind } from '@vscode/prompt-tsx';
import type { ChatQuestion, ChatResponseFileTree, ChatResponseStream, ChatResultUsage, ChatToolInvocationStreamData, ChatVulnerability, ChatWorkspaceFileEdit, Command, ExtendedChatResponsePart, Location, NotebookEdit, Progress, ThinkingDelta, Uri } from 'vscode';
import { ChatHookType, ChatResponseAnchorPart, ChatResponseClearToPreviousToolInvocationReason, ChatResponseCodeblockUriPart, ChatResponseCodeCitationPart, ChatResponseCommandButtonPart, ChatResponseConfirmationPart, ChatResponseExternalEditPart, ChatResponseFileTreePart, ChatResponseHookPart, ChatResponseMarkdownPart, ChatResponseMarkdownWithVulnerabilitiesPart, ChatResponseNotebookEditPart, ChatResponseProgressPart, ChatResponseProgressPart2, ChatResponseReferencePart, ChatResponseReferencePart2, ChatResponseTextEditPart, ChatResponseThinkingProgressPart, ChatResponseWarningPart, ChatResponseWorkspaceEditPart, MarkdownString, TextEdit } from '../../vscodeTypes';
import type { ThemeIcon } from '../vs/base/common/themables';


export interface FinalizableChatResponseStream extends ChatResponseStream {
	finalize(): Promise<void>;
}


export function tryFinalizeResponseStream(stream: ChatResponseStream | FinalizableChatResponseStream) {
	if (typeof (stream as FinalizableChatResponseStream).finalize === 'function') {
		return (stream as FinalizableChatResponseStream).finalize();
	}
}
/**
 * A `ChatResponseStream` that forwards all calls to a single callback.
 */
export class ChatResponseStreamImpl implements FinalizableChatResponseStream {

	public static spy(stream: ChatResponseStream, callback: (part: ExtendedChatResponsePart) => void, finalize?: () => void): ChatResponseStreamImpl {
		return new ChatResponseStreamImpl(
			(value) => {
				callback(value);
				stream.push(value);
			}, (reason) => {
				stream.clearToPreviousToolInvocation(reason);
			}, () => {
				finalize?.();
				return tryFinalizeResponseStream(stream);
			},
			(toolCallId, toolName, streamData) => {
				stream.beginToolInvocation(toolCallId, toolName, streamData);
			},
			(toolCallId, streamData) => {
				stream.updateToolInvocation(toolCallId, streamData);
			},
			(questions, allowSkip) => {
				return stream.questionCarousel(questions, allowSkip);
			},
			(usage) => {
				stream.usage(usage);
			}
		);
	}

	public static filter(stream: ChatResponseStream, callback: (part: ExtendedChatResponsePart) => boolean, finalize?: () => void): ChatResponseStreamImpl {
		return new ChatResponseStreamImpl((value) => {
			if (callback(value)) {
				stream.push(value);
			}
		}, (reason) => {
			stream.clearToPreviousToolInvocation(reason);
		}, () => {
			finalize?.();
			return tryFinalizeResponseStream(stream);
		},
			(toolCallId, toolName, streamData) => {
				stream.beginToolInvocation(toolCallId, toolName, streamData);
			},
			(toolCallId, streamData) => {
				stream.updateToolInvocation(toolCallId, streamData);
			},
			(questions, allowSkip) => {
				return stream.questionCarousel(questions, allowSkip);
			},
			(usage) => {
				stream.usage(usage);
			});
	}

	public static map(stream: ChatResponseStream, callback: (part: ExtendedChatResponsePart) => ExtendedChatResponsePart | undefined, finalize?: () => void): ChatResponseStreamImpl {
		return new ChatResponseStreamImpl((value) => {
			const result = callback(value);
			if (result) {
				stream.push(result);
			}
		}, (reason) => {
			stream.clearToPreviousToolInvocation(reason);
		}, () => {
			finalize?.();
			return tryFinalizeResponseStream(stream);
		},
			(toolCallId, toolName, streamData) => {
				stream.beginToolInvocation(toolCallId, toolName, streamData);
			},
			(toolCallId, streamData) => {
				stream.updateToolInvocation(toolCallId, streamData);
			},
			(questions, allowSkip) => {
				return stream.questionCarousel(questions, allowSkip);
			},
			(usage) => {
				stream.usage(usage);
			});
	}

	constructor(
		private readonly _push: (part: ExtendedChatResponsePart) => void,
		private readonly _clearToPreviousToolInvocation: (reason: ChatResponseClearToPreviousToolInvocationReason) => void,
		private readonly _finalize?: () => void | Promise<void>,
		private readonly _beginToolInvocation?: (toolCallId: string, toolName: string, streamData?: ChatToolInvocationStreamData) => void,
		private readonly _updateToolInvocation?: (toolCallId: string, streamData: ChatToolInvocationStreamData) => void,
		private readonly _questionCarousel?: (questions: ChatQuestion[], allowSkip?: boolean) => Thenable<Record<string, unknown> | undefined>,
		private readonly _usage?: (usage: ChatResultUsage) => void,
	) { }

	async finalize(): Promise<void> {
		await this._finalize?.();
	}

	clearToPreviousToolInvocation(reason: ChatResponseClearToPreviousToolInvocationReason): void {
		this._clearToPreviousToolInvocation(reason);
	}

	markdown(value: string | MarkdownString): void {
		this._push(new ChatResponseMarkdownPart(value));
	}

	anchor(value: Uri | Location, title?: string | undefined): void {
		this._push(new ChatResponseAnchorPart(value, title));
	}

	thinkingProgress(thinkingDelta: ThinkingDelta): void {
		this._push(new ChatResponseThinkingProgressPart(thinkingDelta.text ?? '', thinkingDelta.id, thinkingDelta.metadata));
	}

	hookProgress(hookType: ChatHookType, stopReason?: string, systemMessage?: string): void {
		this._push(new ChatResponseHookPart(hookType, stopReason, systemMessage));
	}

	button(command: Command): void {
		this._push(new ChatResponseCommandButtonPart(command));
	}

	filetree(value: ChatResponseFileTree[], baseUri: Uri): void {
		this._push(new ChatResponseFileTreePart(value, baseUri));
	}

	async externalEdit(target: Uri | Uri[], callback: () => Thenable<unknown>): Promise<string> {
		const part = new ChatResponseExternalEditPart(target instanceof Array ? target : [target], callback);
		this._push(part);
		return part.applied;
	}

	progress(value: string, task?: (progress: Progress<ChatResponseWarningPart | ChatResponseReferencePart>) => Thenable<string | void>): void {
		if (typeof task === 'undefined') {
			this._push(new ChatResponseProgressPart(value));
		} else {
			this._push(new ChatResponseProgressPart2(value, task));
		}
	}

	reference(value: Uri | Location | { variableName: string; value?: Uri | Location }, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri }): void {
		this._push(new ChatResponseReferencePart(value as any, iconPath));
	}

	reference2(value: Uri | Location | { variableName: string; value?: Uri | Location }, iconPath?: Uri | ThemeIcon | { light: Uri; dark: Uri }, options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } }): void {
		this._push(new ChatResponseReferencePart2(value as any, iconPath, options));
	}

	codeCitation(value: Uri, license: string, snippet: string): void {
		this._push(new ChatResponseCodeCitationPart(value, license, snippet));
	}

	push(part: ExtendedChatResponsePart): void {
		this._push(part);
	}

	textEdit(target: Uri, editsOrDone: TextEdit | TextEdit[] | true): void {
		if (Array.isArray(editsOrDone) || editsOrDone instanceof TextEdit) {
			this._push(new ChatResponseTextEditPart(target, editsOrDone));
		} else {
			const part = new ChatResponseTextEditPart(target, []);
			part.isDone = true;
			this._push(part);
		}
	}

	notebookEdit(target: Uri, editsOrDone: NotebookEdit | NotebookEdit[] | true): void {
		if (editsOrDone === true) {
			this._push(new ChatResponseNotebookEditPart(target, true));
		} else if (Array.isArray(editsOrDone)) {
			this._push(new ChatResponseNotebookEditPart(target, editsOrDone));
		} else {
			this._push(new ChatResponseNotebookEditPart(target, editsOrDone));
		}
	}

	workspaceEdit(edits: ChatWorkspaceFileEdit[]): void {
		this._push(new ChatResponseWorkspaceEditPart(edits));
	}

	markdownWithVulnerabilities(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]): void {
		this._push(new ChatResponseMarkdownWithVulnerabilitiesPart(value, vulnerabilities));
	}

	codeblockUri(value: Uri, isEdit?: boolean): void {
		try {
			this._push(new ChatResponseCodeblockUriPart(value, isEdit));
		} catch { } // TODO@joyceerhl remove try/catch
	}

	confirmation(title: string, message: string, data: any, buttons?: string[]): void {
		this._push(new ChatResponseConfirmationPart(title, message, data, buttons));
	}

	warning(value: string | MarkdownString): void {
		this._push(new ChatResponseWarningPart(value));
	}

	beginToolInvocation(toolCallId: string, toolName: string, streamData?: ChatToolInvocationStreamData): void {
		if (this._beginToolInvocation) {
			this._beginToolInvocation(toolCallId, toolName, streamData);
		}
	}

	updateToolInvocation(toolCallId: string, streamData: ChatToolInvocationStreamData): void {
		if (this._updateToolInvocation) {
			this._updateToolInvocation(toolCallId, streamData);
		}
	}

	questionCarousel(questions: ChatQuestion[], allowSkip?: boolean): Thenable<Record<string, unknown> | undefined> {
		if (this._questionCarousel) {
			return this._questionCarousel(questions, allowSkip);
		}
		return Promise.resolve(undefined);
	}

	usage(usage: ChatResultUsage): void {
		if (this._usage) {
			this._usage(usage);
		}
	}
}
