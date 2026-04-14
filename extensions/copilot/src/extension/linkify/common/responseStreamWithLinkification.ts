/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ChatQuestion, ChatResponseClearToPreviousToolInvocationReason, ChatResponseFileTree, ChatResponsePart, ChatResponseStream, ChatResultUsage, ChatToolInvocationStreamData, ChatVulnerability, ChatWorkspaceFileEdit, Command, Location, NotebookEdit, TextEdit, ThinkingDelta, Uri } from 'vscode';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { FinalizableChatResponseStream } from '../../../util/common/chatResponseStreamImpl';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ChatHookType, ChatResponseAnchorPart, ChatResponseCommandButtonPart, ChatResponseConfirmationPart, ChatResponseFileTreePart, ChatResponseMarkdownPart, ChatResponseThinkingProgressPart, ChatToolInvocationPart, MarkdownString } from '../../../vscodeTypes';
import { LinkifiedText, LinkifySymbolAnchor } from './linkifiedText';
import { IContributedLinkifierFactory, ILinkifier, ILinkifyService, LinkifierContext } from './linkifyService';

/**
 * Proxy of {@linkcode ChatResponseStream} that linkifies paths and symbols in emitted Markdown.
 */
export class ResponseStreamWithLinkification implements FinalizableChatResponseStream {

	private readonly _linkifier: ILinkifier;
	private readonly _progress: ChatResponseStream;
	private readonly _token: CancellationToken;

	constructor(
		context: LinkifierContext,
		progress: ChatResponseStream,
		additionalLinkifiers: readonly IContributedLinkifierFactory[],
		token: CancellationToken,
		@ILinkifyService linkifyService: ILinkifyService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		this._linkifier = linkifyService.createLinkifier(context, additionalLinkifiers);
		this._progress = progress;
		this._token = token;
	}

	get totalAddedLinkCount() {
		return this._linkifier.totalAddedLinkCount;
	}

	clearToPreviousToolInvocation(reason: ChatResponseClearToPreviousToolInvocationReason): void {
		this._pendingMarkdown = '';
		this._pendingMarkdownScheduled = false;
		this._linkifier.flush(CancellationToken.None);
		this._progress.clearToPreviousToolInvocation(reason);
	}

	//#region ChatResponseStream
	markdown(value: string | MarkdownString): ChatResponseStream {
		this.appendMarkdown(typeof value === 'string' ? new MarkdownString(value) : value);
		return this;
	}

	anchor(value: Uri | Location, title?: string | undefined): ChatResponseStream {
		this.enqueue(() => this._progress.anchor(value, title), false);
		return this;
	}

	button(command: Command): ChatResponseStream {
		this.enqueue(() => this._progress.button(command), true);
		return this;
	}

	filetree(value: ChatResponseFileTree[], baseUri: Uri): ChatResponseStream {
		this.enqueue(() => this._progress.filetree(value, baseUri), true);
		return this;
	}

	progress(value: string): ChatResponseStream {
		this.enqueue(() => this._progress.progress(value), false);
		return this;
	}

	thinkingProgress(thinkingDelta: ThinkingDelta): ChatResponseStream {
		this.enqueue(() => this._progress.thinkingProgress(thinkingDelta), false);
		return this;
	}

	warning(value: string | MarkdownString): ChatResponseStream {
		this.enqueue(() => this._progress.warning(value), false);
		return this;
	}

	hookProgress(hookType: ChatHookType, stopReason?: string, systemMessage?: string): ChatResponseStream {
		this.enqueue(() => this._progress.hookProgress(hookType, stopReason, systemMessage), false);
		return this;
	}


	reference(value: Uri | Location): ChatResponseStream {
		this.enqueue(() => this._progress.reference(value), false);
		return this;
	}

	reference2(value: Uri | Location): ChatResponseStream {
		this.enqueue(() => this._progress.reference(value), false);
		return this;
	}

	codeCitation(value: Uri, license: string, snippet: string): ChatResponseStream {
		this.enqueue(() => this._progress.codeCitation(value, license, snippet), false);
		return this;
	}

	externalEdit(target: Uri | Uri[], callback: () => Thenable<void>): Thenable<string> {
		return this.enqueue(() => this._progress.externalEdit(target, callback), true);
	}

	push(part: ChatResponsePart): ChatResponseStream {
		if (part instanceof ChatResponseMarkdownPart) {
			this.appendMarkdown(part.value);
		} else {
			this.enqueue(() => this._progress.push(part), this.isBlockPart(part));
		}
		return this;
	}

	private isBlockPart(part: ChatResponsePart): boolean {
		return part instanceof ChatResponseFileTreePart
			|| part instanceof ChatResponseCommandButtonPart
			|| part instanceof ChatResponseConfirmationPart
			|| part instanceof ChatToolInvocationPart
			|| part instanceof ChatResponseThinkingProgressPart;
	}

	textEdit(target: Uri, editsOrDone: TextEdit | TextEdit[] | true): ChatResponseStream {
		// TS makes me do this
		if (editsOrDone === true) {
			this.enqueue(() => this._progress.textEdit(target, editsOrDone), false);
		} else {
			this.enqueue(() => this._progress.textEdit(target, editsOrDone), false);
		}

		return this;
	}

	notebookEdit(target: Uri, edits: NotebookEdit | NotebookEdit[]): void;
	notebookEdit(target: Uri, isDone: true): void;
	notebookEdit(target: Uri, editsOrDone: NotebookEdit | NotebookEdit[] | true): ChatResponseStream {
		// TS makes me do this
		if (editsOrDone === true) {
			this.enqueue(() => this._progress.notebookEdit(target, editsOrDone), false);
		} else {
			this.enqueue(() => this._progress.notebookEdit(target, editsOrDone), false);
		}
		return this;
	}

	workspaceEdit(edits: ChatWorkspaceFileEdit[]): void {
		this.enqueue(() => this._progress.workspaceEdit(edits), false);
	}

	markdownWithVulnerabilities(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]): ChatResponseStream {
		this.enqueue(() => this._progress.markdownWithVulnerabilities(value, vulnerabilities), false);
		return this;
	}

	codeblockUri(uri: Uri, isEdit?: boolean): void {
		if ('codeblockUri' in this._progress) {
			this.enqueue(() => this._progress.codeblockUri(uri, isEdit), false);
		}
	}

	confirmation(title: string, message: string, data: any): ChatResponseStream {
		this.enqueue(() => this._progress.confirmation(title, message, data), true);
		return this;
	}

	beginToolInvocation(toolCallId: string, toolName: string, streamData?: ChatToolInvocationStreamData): ChatResponseStream {
		this.enqueue(() => this._progress.beginToolInvocation(toolCallId, toolName, streamData), true);
		return this;
	}

	updateToolInvocation(toolCallId: string, streamData: { partialInput?: unknown }): ChatResponseStream {
		this.enqueue(() => this._progress.updateToolInvocation(toolCallId, streamData), false);
		return this;
	}

	questionCarousel(questions: ChatQuestion[], allowSkip?: boolean): Thenable<Record<string, unknown> | undefined> {
		return this.enqueue(() => this._progress.questionCarousel(questions, allowSkip), true);
	}

	usage(usage: ChatResultUsage): ChatResponseStream {
		this.enqueue(() => this._progress.usage(usage), false);
		return this;
	}

	//#endregion

	private sequencer: Promise<unknown> = Promise.resolve();

	private enqueue<T>(f: () => T | Thenable<T>, flush: boolean) {
		if (flush) {
			this.sequencer = this.sequencer.then(() => this.doFinalize());
		}
		this.sequencer = this.sequencer.then(f);
		return this.sequencer as Promise<T>;
	}

	private _pendingMarkdown = '';
	private _pendingMarkdownScheduled = false;

	private async appendMarkdown(md: MarkdownString): Promise<void> {
		if (!md.value) {
			return;
		}

		// Buffer incoming markdown and schedule a single drain when the sequencer frees up.
		// This coalesces many small markdown chunks into fewer linkifier.append() calls,
		// dramatically reducing queue wait when the linkifier is busy.
		this._pendingMarkdown += md.value;

		if (!this._pendingMarkdownScheduled) {
			this._pendingMarkdownScheduled = true;
			this.enqueue(async () => {
				const buf = this._pendingMarkdown;
				this._pendingMarkdown = '';
				this._pendingMarkdownScheduled = false;

				const output = await this._linkifier.append(buf, this._token);
				if (this._token.isCancellationRequested) {
					return;
				}

				this.outputMarkdown(output);
			}, false);
		}
	}

	async finalize() {
		await this.enqueue(() => this.doFinalize(), false);
	}

	private async doFinalize() {
		const textToApply = await this._linkifier.flush(this._token);
		if (this._token.isCancellationRequested) {
			return;
		}

		if (textToApply) {
			this.outputMarkdown(textToApply);
		}
	}

	private outputMarkdown(textToApply: LinkifiedText) {
		for (const part of textToApply.parts) {
			if (typeof part === 'string') {
				if (!part.length) {
					continue;
				}

				const content = new MarkdownString(part);

				const folder = this.workspaceService.getWorkspaceFolders()?.at(0);
				if (folder) {
					content.baseUri = folder.path.endsWith('/') ? folder : folder.with({ path: folder.path + '/' });
				}

				this._progress.markdown(content);
			} else {
				if (part instanceof LinkifySymbolAnchor) {
					const chatPart = new ChatResponseAnchorPart(part.symbolInformation as any);
					if (part.resolve) {
						(chatPart as any).resolve = () => part.resolve!(this._token);
					}
					this._progress.push(chatPart);
				} else {
					this._progress.anchor(part.value, part.title);
				}
			}
		}
	}
}
