/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { RenderPromptResult } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IReviewService, ReviewComment, ReviewRequest } from '../../../platform/review/common/reviewService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { MarkdownString } from '../../../vscodeTypes';
import { Intent } from '../../common/constants';
import { LinkifiedPart, LinkifiedText, LinkifyLocationAnchor } from '../../linkify/common/linkifiedText';
import { IContributedLinkifier, LinkifierContext } from '../../linkify/common/linkifyService';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { parseFeedbackResponse, parseReviewComments } from '../../prompt/node/feedbackGenerator';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IResponseProcessorContext, ReplyInterpreter } from '../../prompt/node/intents';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { CurrentChange, CurrentChangeInput } from '../../prompts/node/feedback/currentChange';
import { ProvideFeedbackPrompt } from '../../prompts/node/feedback/provideFeedback';

export const reviewIntentPromptSnippet = 'Review the currently selected code.';

export const reviewLocalChangesMessage = l10n.t('local changes');


class ReviewIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	readonly linkification = {
		additionaLinkifiers: [{ create: () => new LineLinkifier(this.documentContext.document.uri) }]
	};

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		protected readonly documentContext: IDocumentContext,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@ILogService private readonly logService: ILogService,
		@IGitExtensionService private readonly gitExtensionService: IGitExtensionService,
	) {
		super(intent, location, endpoint);
	}

	async createRenderer({ history, query, chatVariables }: IBuildPromptContext, endpoint: IChatEndpoint, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken) {

		const input: CurrentChangeInput[] = [];
		if (query === reviewLocalChangesMessage) {
			const changes = await CurrentChange.getCurrentChanges(this.gitExtensionService, 'workingTree');
			const documentsAndChanges = await Promise.all<CurrentChangeInput>(changes.map(async change => {
				const document = await this.workspaceService.openTextDocumentAndSnapshot(change.uri);
				return {
					document,
					relativeDocumentPath: path.relative(change.repository.rootUri.fsPath, change.uri.fsPath),
					change,
				};
			}));
			documentsAndChanges.map(i => input.push(i));
		} else {
			const editor = this.tabsAndEditorsService.activeTextEditor;
			if (editor) {
				input.push({
					document: TextDocumentSnapshot.create(editor.document),
					relativeDocumentPath: path.basename(editor.document.uri.fsPath),
					selection: editor.selection,
				});
			}
		}

		return PromptRenderer.create(this.instantiationService, endpoint, ProvideFeedbackPrompt, {
			query,
			history,
			chatVariables,
			input,
			logService: this.logService,
		});
	}

	override async buildPrompt(context: IBuildPromptContext, progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>, token: vscode.CancellationToken): Promise<RenderPromptResult> {
		if (context.query === '') {
			context = { ...context, query: reviewIntentPromptSnippet };
		}
		return super.buildPrompt(context, progress, token);
	}
}

class InlineReviewIntentInvocation extends ReviewIntentInvocation implements IIntentInvocation {

	processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const replyInterpreter = this.instantiationService.createInstance(ReviewReplyInterpreter, this.documentContext);
		return replyInterpreter.processResponse(context, inputStream, outputStream, token);
	}
}

export class ReviewIntent implements IIntent {

	static readonly ID = Intent.Review;
	readonly id = Intent.Review;
	readonly locations = [ChatLocation.Panel, ChatLocation.Editor];
	readonly description = l10n.t('Review the selected code in your active editor');

	readonly commandInfo: IIntentSlashCommandInfo | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
	) { }

	async invoke(invocationContext: IIntentInvocationContext): Promise<IIntentInvocation> {

		const documentContext = invocationContext.documentContext;
		const location = invocationContext.location;
		const endpoint = await this.endpointProvider.getChatEndpoint(invocationContext.request);
		if (location === ChatLocation.Editor) {
			return this.instantiationService.createInstance(InlineReviewIntentInvocation, this, location, endpoint, documentContext!);
		}
		return this.instantiationService.createInstance(ReviewIntentInvocation, this, location, endpoint, documentContext!);
	}
}

class LineLinkifier implements IContributedLinkifier {

	constructor(private readonly file: vscode.Uri) { }

	async linkify(newText: string, context: LinkifierContext, token?: vscode.CancellationToken): Promise<LinkifiedText | undefined> {
		const parsedResponse = parseFeedbackResponse(newText);
		if (!parsedResponse.length) {
			return;
		}

		let remaining = 0;
		const parts: LinkifiedPart[] = [];
		for (const match of parsedResponse) {
			parts.push(newText.substring(remaining, match.linkOffset));
			parts.push(new LinkifyLocationAnchor(this.file.with({ fragment: String(match.from + 1) }), newText.substring(match.linkOffset, match.linkOffset + match.linkLength)));
			remaining = match.linkOffset + match.linkLength;
		}
		parts.push(newText.substring(remaining));
		return { parts };
	}
}

class ReviewReplyInterpreter implements ReplyInterpreter {

	private updating = false;
	private text = '';
	private comments: ReviewComment[] = [];

	constructor(
		private readonly documentContext: IDocumentContext,
		@IReviewService private readonly reviewService: IReviewService
	) {
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		const request: ReviewRequest = {
			source: 'vscodeCopilotChat',
			promptCount: 1,
			messageId: generateUuid(), // TODO: Use from request?
			inputType: 'selection',
			inputRanges: [
				{
					uri: this.documentContext.document.uri,
					ranges: [this.documentContext.selection]
				}
			],
		};

		for await (const part of inputStream) {
			this.text += part.delta.text;
			if (!this.updating) {
				this.updating = true;
				const content = new MarkdownString(l10n.t({
					message: 'Reviewing your code...\n',
					comment: `{Locked='](command:workbench.panel.markers.view.focus)'}`,
				}));
				content.isTrusted = {
					enabledCommands: ['workbench.panel.markers.view.focus']
				};
				outputStream.markdown(content);
			}
			const comments = parseReviewComments(request, [
				{
					document: this.documentContext.document,
					relativeDocumentPath: path.basename(this.documentContext.document.uri.fsPath),
					selection: this.documentContext.selection
				}
			], this.text, true);
			if (comments.length > this.comments.length) {
				this.reviewService.addReviewComments(comments.slice(this.comments.length));
				this.comments = comments;
			}
		}

		const comments = parseReviewComments(request, [
			{
				document: this.documentContext.document,
				relativeDocumentPath: path.basename(this.documentContext.document.uri.fsPath),
				selection: this.documentContext.selection
			}
		], this.text, false); // parse all
		if (comments.length > this.comments.length) {
			this.reviewService.addReviewComments(comments.slice(this.comments.length));
			this.comments = comments;
		}
		outputStream.markdown(l10n.t('Reviewed your code and generated {0} suggestions.', comments.length));
	}
}
