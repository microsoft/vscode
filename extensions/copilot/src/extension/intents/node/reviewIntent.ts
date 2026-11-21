/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { RenderPromptResult } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ICustomInstructionsService } from '../../../platform/customInstructions/common/customInstructionsService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../../platform/endpoint/common/domainService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IEnvService } from '../../../platform/env/common/envService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { Progress } from '../../../platform/notification/common/notificationService';
import { IReviewService, ReviewComment, ReviewRequest } from '../../../platform/review/common/reviewService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { DeferredPromise } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { MarkdownString } from '../../../vscodeTypes';
import { Intent } from '../../common/constants';
import { LinkifiedPart, LinkifiedText, LinkifyLocationAnchor } from '../../linkify/common/linkifiedText';
import { IContributedLinkifier, LinkifierContext } from '../../linkify/common/linkifyService';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { FeedbackResult, parseFeedbackResponse, parseReviewComments } from '../../prompt/node/feedbackGenerator';
import { IIntent, IIntentInvocation, IIntentInvocationContext, IIntentSlashCommandInfo, IResponseProcessorContext, IntentLinkificationOptions, nullRenderPromptResult, ReplyInterpreter } from '../../prompt/node/intents';
import { githubReview } from '../../review/node/githubReviewAgent';
import { ReviewGroup } from '../../review/node/doReview';
import { PromptRenderer, RendererIntentInvocation } from '../../prompts/node/base/promptRenderer';
import { CurrentChange, CurrentChangeInput } from '../../prompts/node/feedback/currentChange';
import { ProvideFeedbackPrompt } from '../../prompts/node/feedback/provideFeedback';

export const reviewIntentPromptSnippet = 'Review the currently selected code.';

export const reviewLocalChangesMessage = l10n.t('local changes');

export class ReviewIntentInvocation extends RendererIntentInvocation implements IIntentInvocation {

	get linkification(): IntentLinkificationOptions | undefined {
		// Only relevant on the inline (editor) path. The chat path renders its own
		// anchors via markdown headers, so leave linkification disabled there to
		// avoid `LineLinkifier` mis-anchoring against the SCM-button query.
		if (this.location !== ChatLocation.Editor || !this.documentContext) {
			return undefined;
		}
		const uri = this.documentContext.document.uri;
		return { additionaLinkifiers: [{ create: () => new LineLinkifier(uri) }] };
	}

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
		@IAuthenticationService private readonly authService: IAuthenticationService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IDomainService private readonly domainService: IDomainService,
		@IFetcherService private readonly fetcherService: IFetcherService,
		@IEnvService private readonly envService: IEnvService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@ICustomInstructionsService private readonly customInstructionsService: ICustomInstructionsService,
		@IReviewService private readonly reviewService: IReviewService,
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
		if (this.location === ChatLocation.Panel) {
			// Chat path skips the legacy LLM render. `processResponse` drives `githubReview()` directly.
			return nullRenderPromptResult();
		}
		if (context.query === '') {
			context = { ...context, query: reviewIntentPromptSnippet };
		}
		return super.buildPrompt(context, progress, token);
	}

	async processResponse(context: IResponseProcessorContext, _inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
		// Inline (editor) chat overrides this on `InlineReviewIntentInvocation`.
		if (this.location !== ChatLocation.Panel) {
			return;
		}
		const copilotToken = await this.authService.getCopilotToken();
		if (!copilotToken.isCopilotCodeReviewEnabled) {
			outputStream.markdown(l10n.t('Code review is not available for this account.'));
			return;
		}
		const editor = this.tabsAndEditorsService.activeTextEditor;
		const parsed = parseReviewScope(context.turn.request.message);
		let group: ReviewGroup;
		switch (parsed) {
			case 'selection':
				if (editor && !editor.selection.isEmpty) {
					group = 'selection';
				} else {
					outputStream.markdown(`> ${l10n.t('No active selection. Reviewing unstaged changes instead.')}\n\n`);
					group = 'workingTree';
				}
				break;
			case 'file':
				if (editor) {
					group = { group: 'workingTree', file: editor.document.uri };
				} else {
					outputStream.markdown(`> ${l10n.t('No active file. Reviewing unstaged changes instead.')}\n\n`);
					group = 'workingTree';
				}
				break;
			default:
				group = parsed;
				break;
		}

		// Scope-aware pre-clear of stale Comments-panel state. A re-run targeting a single
		// file should only retire entries for that file; broader scopes wipe everything to
		// match the side-panel behavior in doReview.ts.
		const scopedUri = group === 'selection'
			? editor?.document.uri
			: (typeof group !== 'string' && 'file' in group ? group.file : undefined);
		const existing = this.reviewService.getReviewComments();
		const toRemove = scopedUri
			? existing.filter(c => c.uri.toString() === scopedUri.toString())
			: existing;
		if (toRemove.length) {
			this.reviewService.removeReviewComments(toRemove);
		}

		const scopeDescription = describeReviewScope(group);
		outputStream.markdown(l10n.t('Reviewing {0}…\n\n', scopeDescription));

		// Track every comment we hand to the review service so we can roll back on cancel.
		const addedComments: ReviewComment[] = [];
		const safeAdd = (comments: ReviewComment[]): void => {
			try {
				this.reviewService.addReviewComments(comments, { suppressAutoReveal: true });
				addedComments.push(...comments);
			} catch (err) {
				this.logService.error(err, '[review intent] addReviewComments failed');
				outputStream.markdown(l10n.t('Note: could not update Comments panel.') + '\n\n');
			}
		};

		const reviewComplete = new DeferredPromise<string>();
		const reviewStore = new DisposableStore();
		// Cancellation should immediately stop the task-bound spinner; the
		// `'Review cancelled.'` markdown line is rendered later in the cancel branch.
		reviewStore.add(token.onCancellationRequested(() => {
			if (!reviewComplete.isSettled) {
				reviewComplete.complete(l10n.t('Review cancelled'));
			}
		}));

		// Pin a task-bound spinner from the very start so the user sees activity through
		// the slow `collectChanges` + `fetchComments` phases that fire before any phase
		// callback. The spinner sustains until `reviewComplete` is settled at any of the
		// exit paths (cancel / error / success / empty / defensive `finally`).
		outputStream.progress(l10n.t('Analyzing your changes…'), () => reviewComplete.p);

		const progress: Progress<ReviewComment[]> = {
			report: comments => {
				for (const comment of comments) {
					if (token.isCancellationRequested) {
						return;
					}
					safeAdd([comment]);
				}
			}
		};
		let result: FeedbackResult;
		try {
			result = await githubReview(
				this.logService, this.gitExtensionService, this.authService,
				this.capiClientService, this.domainService, this.fetcherService,
				this.envService, this.ignoreService, this.workspaceService,
				this.customInstructionsService, group, editor, progress, token
			);
			if (result.type === 'cancelled' || token.isCancellationRequested) {
				if (!reviewComplete.isSettled) {
					reviewComplete.complete(l10n.t('Review cancelled'));
				}
				if (addedComments.length) {
					this.reviewService.removeReviewComments(addedComments);
				}
				outputStream.markdown(l10n.t('Review cancelled.'));
				return;
			}
			if (result.type === 'error') {
				if (!reviewComplete.isSettled) {
					reviewComplete.complete(l10n.t('Review failed'));
				}
				outputStream.markdown(l10n.t('Review failed: {0}', result.reason));
				return;
			}
			const excluded = result.excludedComments ?? [];
			if (excluded.length) {
				safeAdd(excluded);
			}
			const filesWithComments = new Set([...result.comments, ...excluded].map(c => c.uri.toString())).size;
			if (result.comments.length === 0) {
				if (!reviewComplete.isSettled) {
					reviewComplete.complete(l10n.t('No issues found'));
				}
				outputStream.markdown(l10n.t('No issues found.'));
				return;
			}
			if (!reviewComplete.isSettled) {
				reviewComplete.complete(l10n.t('Review complete: {0} findings across {1} files', result.comments.length, filesWithComments));
			}
			outputStream.markdown(l10n.t('Review complete: {0} findings across {1} files.', result.comments.length, filesWithComments));
			if (excluded.length) {
				outputStream.markdown('\n\n' + l10n.t('{0} comments filtered by policy.', excluded.length));
			}
			if (result.comments.length + excluded.length >= 5) {
				outputStream.markdown(buildFindingsByFileSummary(result.comments, excluded, this.workspaceService));
			}
			outputStream.button({ command: 'github.copilot.chat.review.nextFromChat', title: l10n.t('Next Comment') });
		} catch (err) {
			this.logService.error(err, '[review intent] githubReview threw');
			if (!reviewComplete.isSettled) {
				reviewComplete.complete(l10n.t('Review failed'));
			}
			outputStream.markdown(l10n.t('Review failed. Please try again.'));
		} finally {
			// Defensive: always settle the task-bound progress so the spinner stops,
			// even if `githubReview` threw before the catch block ran.
			if (!reviewComplete.isSettled) {
				reviewComplete.complete(l10n.t('Review failed'));
			}
			reviewStore.dispose();
		}
	}
}

/**
 * Parse the leading scope token from a `/review` chat query. Returns the
 * scope to use; for `'selection'`/`'file'` the caller must verify an editor
 * is present and fall back to `'workingTree'` if not. Unrecognised tokens,
 * empty queries, and the SCM-button sentinel (`reviewLocalChangesMessage`)
 * all map to `'workingTree'`.
 */
export function parseReviewScope(query: string): 'selection' | 'index' | 'workingTree' | 'all' | 'file' {
	if (query === reviewLocalChangesMessage) {
		return 'workingTree';
	}
	const first = query.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
	switch (first) {
		case 'staged': return 'index';
		case 'unstaged': return 'workingTree';
		case 'all': return 'all';
		case 'selection': return 'selection';
		case 'file': return 'file';
		default: return 'workingTree';
	}
}

/**
 * Localized human-readable label for a review scope used in the entry narrative.
 */
function describeReviewScope(group: ReviewGroup): string {
	if (typeof group !== 'string') {
		if ('file' in group) {
			return l10n.t('the current file');
		}
		return l10n.t('the requested changes');
	}
	switch (group) {
		case 'selection': return l10n.t('the current selection');
		case 'index': return l10n.t('staged changes');
		case 'workingTree': return l10n.t('unstaged changes');
		case 'all': return l10n.t('all changes');
	}
}

/**
 * Derive the structured fields needed to render one chat-narrative line for a
 * streamed review comment. Code fences and collapsed whitespace are stripped so
 * the excerpt stays on a single line, and long bodies are clipped to ~80
 * characters with an ellipsis.
 */
function buildFindingExcerpt(comment: ReviewComment, workspaceService: IWorkspaceService): { severity: string; kind: string; relativePath: string; line: number; excerpt: string } {
	const relativePath = workspaceService.asRelativePath(comment.uri);
	const line = comment.range.start.line + 1;
	const bodyText = typeof comment.body === 'string' ? comment.body : comment.body.value;
	const stripped = bodyText.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim();
	const excerpt = stripped.length > 80 ? `${stripped.slice(0, 77)}…` : stripped;
	return { severity: comment.severity, kind: comment.kind, relativePath, line, excerpt };
}

/**
 * Build a per-file summary listing every finding (included and excluded) grouped
 * by file as plain markdown. Files are sorted A→Z; within each group findings
 * are ordered by line then character. Each file group is rendered as a `###`
 * heading followed by a bullet list of clickable links, always expanded.
 * Excluded comments are folded into the same group with a `(filtered)` suffix.
 */
function buildFindingsByFileSummary(included: readonly ReviewComment[], excluded: readonly ReviewComment[], workspaceService: IWorkspaceService): MarkdownString {
	type GroupEntry = { comment: ReviewComment; isExcluded: boolean };
	const groups = new Map<string, { relPath: string; entries: GroupEntry[] }>();
	const addEntry = (comment: ReviewComment, isExcluded: boolean): void => {
		const key = comment.uri.toString();
		let group = groups.get(key);
		if (!group) {
			group = { relPath: workspaceService.asRelativePath(comment.uri), entries: [] };
			groups.set(key, group);
		}
		group.entries.push({ comment, isExcluded });
	};
	for (const c of included) {
		addEntry(c, false);
	}
	for (const c of excluded) {
		addEntry(c, true);
	}
	const orderedGroups = [...groups.values()].sort((a, b) =>
		a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' })
	);
	const lines: string[] = [];
	lines.push(`**${l10n.t('Findings by file')}**`);
	lines.push('');
	for (const group of orderedGroups) {
		const entries = group.entries.slice().sort((a, b) => {
			const lineDiff = a.comment.range.start.line - b.comment.range.start.line;
			if (lineDiff !== 0) {
				return lineDiff;
			}
			return a.comment.range.start.character - b.comment.range.start.character;
		});
		const headingLabel = entries.length === 1
			? l10n.t('{0} (1 finding)', group.relPath)
			: l10n.t('{0} ({1} findings)', group.relPath, entries.length);
		lines.push(`### ${headingLabel}`);
		lines.push('');
		for (const entry of entries) {
			const { line, excerpt } = buildFindingExcerpt(entry.comment, workspaceService);
			const basename = path.basename(entry.comment.uri.fsPath);
			const suffix = entry.isExcluded ? ' ' + l10n.t('(filtered)') : '';
			const ch = entry.comment.range.start.character;
			const args = encodeURIComponent(JSON.stringify([entry.comment.uri.toString(), line, ch]));
			lines.push(`- [${basename}:${line}](command:github.copilot.chat.review.revealComment?${args}): ${excerpt}${suffix}`);
		}
		lines.push('');
	}
	const md = new MarkdownString(lines.join('\n'));
	md.isTrusted = { enabledCommands: ['github.copilot.chat.review.revealComment'] };
	return md;
}

class InlineReviewIntentInvocation extends ReviewIntentInvocation implements IIntentInvocation {

	override processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {
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
