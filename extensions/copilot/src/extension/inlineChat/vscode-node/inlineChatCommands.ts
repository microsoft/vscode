/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { editorAgentName, getChatParticipantIdFromName } from '../../../platform/chat/common/chatAgents';
import { trimCommonLeadingWhitespace } from '../../../platform/chunking/node/naiveChunker';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { isScenarioAutomation } from '../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { IParserService } from '../../../platform/parser/node/parserService';
import type { CodeReviewInput } from '../../../platform/review/common/reviewCommand';
import { IReviewService, ReviewComment, ReviewSuggestionChange } from '../../../platform/review/common/reviewService';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { createFencedCodeBlock } from '../../../util/common/markdown';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { CancellationError, onBugIndicatingError } from '../../../util/vs/base/common/errors';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Intent } from '../../common/constants';
import { explainIntentPromptSnippet } from '../../intents/node/explainIntent';
import { ChatParticipantRequestHandler } from '../../prompt/node/chatParticipantRequestHandler';
import { sendReviewActionTelemetry } from '../../prompt/node/feedbackGenerator';
import { CurrentSelection } from '../../prompts/node/panel/currentSelection';
import { SymbolAtCursor } from '../../prompts/node/panel/symbolAtCursor';
import { reviewFileChanges, ReviewSession } from '../../review/node/doReview';
import { QuickFixesProvider, RefactorsProvider } from './inlineChatCodeActions';
import { NotebookExectionStatusBarItemProvider } from './inlineChatNotebookActions';

export function registerInlineChatCommands(accessor: ServicesAccessor): IDisposable {
	const instaService = accessor.get(IInstantiationService);
	const tabsAndEditorsService = accessor.get(ITabsAndEditorsService);
	const scopeSelector = accessor.get(IScopeSelector);
	const ignoreService = accessor.get(IIgnoreService);
	const reviewService = accessor.get(IReviewService);
	const logService = accessor.get(ILogService);
	const telemetryService = accessor.get(ITelemetryService);
	const extensionContext = accessor.get(IVSCodeExtensionContext);
	const configurationService = accessor.get(IConfigurationService);
	const parserService = accessor.get(IParserService);

	const disposables = new DisposableStore();
	const doExplain = async (arg0: any, fromPalette?: true) => {
		let message = `/${Intent.Explain} `;
		let selectedText;
		let activeDocumentUri;
		let explainingDiagnostics = false;
		if (typeof arg0 === 'string' && arg0) {
			message = arg0;
		} else {
			// First see whether we are explaining diagnostics
			const emptySelection = CurrentSelection.getCurrentSelection(tabsAndEditorsService, true);
			if (emptySelection) {
				const severeDiagnostics = vscode.languages.getDiagnostics(emptySelection.activeDocument.uri);
				const diagnosticsInSelection = severeDiagnostics.filter(d => !!d.range.intersection(emptySelection.range));
				const filteredDiagnostics = QuickFixesProvider.getWarningOrErrorDiagnostics(diagnosticsInSelection);
				if (filteredDiagnostics.length) {
					message += QuickFixesProvider.getDiagnosticsAsText(severeDiagnostics);
					explainingDiagnostics = true;
				}
			}

			const selection = CurrentSelection.getCurrentSelection(tabsAndEditorsService);
			if (!explainingDiagnostics && selection) {
				message += explainIntentPromptSnippet;
				selectedText = formatSelection({ languageId: selection.languageId, selectedText: selection.selectedText });
				activeDocumentUri = selection.activeDocument.uri;
			}

			if (!explainingDiagnostics && emptySelection && fromPalette) {
				// Scope selection may further refine the active selection if it was ambiguous
				try {
					const selectedScope = await SymbolAtCursor.getSelectedScope(
						ignoreService,
						configurationService,
						tabsAndEditorsService,
						scopeSelector,
						parserService,
						{ document: TextDocumentSnapshot.create(emptySelection.activeDocument), selection: emptySelection.range });
					if (selectedScope && selectedScope.symbolAtCursorState && selectedScope.symbolAtCursorState.codeAtCursor) {
						message += explainIntentPromptSnippet;
						const languageId = selectedScope.symbolAtCursorState.document.languageId ?? '';
						selectedText = formatSelection({ languageId, selectedText: selectedScope.symbolAtCursorState.codeAtCursor });
						activeDocumentUri = emptySelection.activeDocument.uri;
					}
				} catch (ex) {
					if (ex instanceof CancellationError) {
						// If the user invoked Explain This from the palette and chooses not to select a scope, we should not submit the question to chat
						return;
					}
					onBugIndicatingError(ex);
				}
			}
		}
		if (activeDocumentUri && selectedText && !await ignoreService.isCopilotIgnored(activeDocumentUri)) {
			message += selectedText;
		}
		vscode.commands.executeCommand('workbench.action.chat.open', { query: message });
	};
	const doApplyReview = async (commentThread: vscode.CommentThread, revealNext = false) => {
		const comment = reviewService.findReviewComment(commentThread);
		if (!comment || !comment.suggestion) {
			return;
		}
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor || activeEditor.document.uri.toString() !== comment.document.uri.toString()) {
			return;
		}
		const { edits } = await comment.suggestion;
		activeEditor.edit(editBuilder => {
			edits.forEach(edit => {
				editBuilder.replace(edit.range, edit.newText);
			});
		});

		if (revealNext) {
			goToNextReview(commentThread, +1);
		}

		const totalComments = reviewService.getReviewComments().length;
		reviewService.removeReviewComments([comment]);
		sendReviewActionTelemetry(comment, totalComments, 'applySuggestion', logService, telemetryService, instaService);
	};
	const doContinueInInlineChat = async (commentThread: vscode.CommentThread) => {
		const comment = reviewService.findReviewComment(commentThread);
		if (!comment) {
			return;
		}
		const totalComments = reviewService.getReviewComments().length;
		const message = comment.body instanceof vscode.MarkdownString ? comment.body.value : comment.body;
		reviewService.removeReviewComments([comment]);
		await vscode.commands.executeCommand('vscode.editorChat.start', {
			initialRange: commentThread.range,
			message: `/fix ${message}`,
			autoSend: true,
		});
		sendReviewActionTelemetry(comment, totalComments, 'continueInInlineChat', logService, telemetryService, instaService);
	};
	const doContinueInChat = async (thread: vscode.CommentThread) => {
		const comment = reviewService.findReviewComment(thread);
		if (!comment) {
			return;
		}
		const totalComments = reviewService.getReviewComments().length;
		const message = comment.body instanceof vscode.MarkdownString ? comment.body.value : comment.body;
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query: 'Explain your comment.',
			isPartialQuery: true,
			previousRequests: [
				{
					request: 'Review my code.',
					response: `In file \`${path.basename(comment.uri.fsPath)}\` at line ${comment.range.start.line + 1}:

${message}`,
				}
			]
		});
		sendReviewActionTelemetry(comment, totalComments, 'continueInChat', logService, telemetryService, instaService);
	};
	const doDiscardReview = async (commentThread: vscode.CommentThread, revealNext = false) => {
		if (revealNext) {
			goToNextReview(commentThread, +1);
		}

		const reviewComment = reviewService.findReviewComment(commentThread);
		if (reviewComment) {
			const totalComments = reviewService.getReviewComments().length;
			reviewService.removeReviewComments([reviewComment]);
			sendReviewActionTelemetry(reviewComment, totalComments, 'discardComment', logService, telemetryService, instaService);
		}
	};
	const doDiscardAllReview = async () => {
		const comments = reviewService.getReviewComments();
		if (comments.length) {
			reviewService.removeReviewComments(comments);
			sendReviewActionTelemetry(comments, comments.length, 'discardAllComments', logService, telemetryService, instaService);
		}
	};
	const markReviewHelpful = async (comment: vscode.Comment) => {
		const reviewComment = reviewService.findReviewComment(comment);
		if (reviewComment) {
			const commentThread = reviewService.findCommentThread(reviewComment);
			if (commentThread) {
				commentThread.contextValue = updateContextValue(commentThread.contextValue, 'markedAsHelpful', 'markedAsUnhelpful');
			}
			const totalComments = reviewService.getReviewComments().length;
			sendReviewActionTelemetry(reviewComment, totalComments, 'helpful', logService, telemetryService, instaService);
		}
	};
	const markReviewUnhelpful = async (comment: vscode.Comment) => {
		const reviewComment = reviewService.findReviewComment(comment);
		if (reviewComment) {
			const commentThread = reviewService.findCommentThread(reviewComment);
			if (commentThread) {
				commentThread.contextValue = updateContextValue(commentThread.contextValue, 'markedAsUnhelpful', 'markedAsHelpful');
			}
			const totalComments = reviewService.getReviewComments().length;
			sendReviewActionTelemetry(reviewComment, totalComments, 'unhelpful', logService, telemetryService, instaService);
		}
	};
	const extensionMode = extensionContext.extensionMode;
	if (typeof extensionMode === 'number' && (extensionMode !== vscode.ExtensionMode.Test || isScenarioAutomation)) {
		reviewService.updateContextValues();
	}
	const goToNextReview = (currentThread: vscode.CommentThread | undefined, direction: number) => {
		let newComment: ReviewComment | undefined;
		if (currentThread) {
			const reviewComment = reviewService.findReviewComment(currentThread);
			if (!reviewComment) {
				return;
			}
			const reviewComments = reviewService.getReviewComments();
			const currentIndex = reviewComments.indexOf(reviewComment);
			const newIndex = (currentIndex + direction + reviewComments.length) % reviewComments.length;
			newComment = reviewComments[newIndex];
		} else {
			const reviewComments = reviewService.getReviewComments();
			newComment = reviewComments[direction > 0 ? 0 : reviewComments.length - 1];
		}
		const newThread = newComment && reviewService.findCommentThread(newComment);
		if (!newThread) {
			return;
		}
		if (direction !== 0) {
			(newThread as unknown as vscode.CommentThread2).reveal();
		}
		instaService.invokeFunction(fetchSuggestion, newThread);
	};
	const doGenerate = () => {
		return vscode.commands.executeCommand('vscode.editorChat.start', { message: '/generate ' });
	};
	const doFix = () => {
		const activeDocument = vscode.window.activeTextEditor;
		if (!activeDocument) {
			return;
		}
		const activeSelection = activeDocument.selection;
		const diagnostics = vscode.languages.getDiagnostics(activeDocument.document.uri).filter(diagnostic => {
			return !!activeSelection.intersection(diagnostic.range);
		}).map(d => d.message).join(', ');
		return vscode.commands.executeCommand('vscode.editorChat.start', { message: `/${Intent.Fix} ${diagnostics}`, autoSend: true, initialRange: vscode.window.activeTextEditor?.selection });
	};

	const doGenerateAltText = async (arg: unknown) => {
		if (arg && typeof arg === 'object' && 'isUrl' in arg && 'resolvedImagePath' in arg && typeof arg.resolvedImagePath === 'string' && 'type' in arg) {
			const baseQuery = 'Create an alt text description that is helpful for screen readers and people who are blind or have visual impairment. Never start alt text with "Image of..." or "Picture of...". Please clearly identify the primary subject or subjects of the image. Describe what the subject is doing, if applicable. Please add a short description of the wider environment. If there is text in the image please transcribe and include it. Please describe the emotional tone of the image, if applicable. Do not use single or double quotes in the alt text.';
			const fullQuery = arg.type === 'generate' ? baseQuery : `Refine the existing alt text for clarity and usefulness for screen readers. ${baseQuery}`;

			const uri = arg.isUrl ? URI.parse(arg.resolvedImagePath) : URI.file(arg.resolvedImagePath);
			return vscode.commands.executeCommand('vscode.editorChat.start', { message: fullQuery, attachments: [uri], autoSend: true, initialRange: vscode.window.activeTextEditor?.selection });
		}
	};

	// register commands
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.explain', doExplain));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.explain.palette', () => doExplain(undefined, true)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review', () => instaService.createInstance(ReviewSession).review('selection', vscode.ProgressLocation.Notification)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.stagedChanges', () => instaService.createInstance(ReviewSession).review('index', vscode.ProgressLocation.Notification)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.unstagedChanges', () => instaService.createInstance(ReviewSession).review('workingTree', vscode.ProgressLocation.Notification)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.changes', () => instaService.createInstance(ReviewSession).review('all', vscode.ProgressLocation.Notification)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.stagedFileChange', (resource: vscode.SourceControlResourceState) => {
		return instaService.createInstance(ReviewSession).review({ group: 'index', file: resource.resourceUri }, vscode.ProgressLocation.Notification);
	}));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.unstagedFileChange', (resource: vscode.SourceControlResourceState) => {
		return instaService.createInstance(ReviewSession).review({ group: 'workingTree', file: resource.resourceUri }, vscode.ProgressLocation.Notification);
	}));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.codeReview.run', (input: CodeReviewInput) => {
		return instaService.invokeFunction(reviewFileChanges, input);
	}));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.apply', doApplyReview));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.applyAndNext', (commentThread: vscode.CommentThread) => doApplyReview(commentThread, true)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.applyShort', (commentThread: vscode.CommentThread) => doApplyReview(commentThread, true)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.continueInInlineChat', doContinueInInlineChat));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.continueInChat', doContinueInChat));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.discard', doDiscardReview));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.discardAndNext', (commentThread: vscode.CommentThread) => doDiscardReview(commentThread, true)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.discardShort', (commentThread: vscode.CommentThread) => doDiscardReview(commentThread, true)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.discardAll', doDiscardAllReview));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.markHelpful', markReviewHelpful));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.markUnhelpful', markReviewUnhelpful));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.previous', thread => goToNextReview(thread, -1)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.next', thread => goToNextReview(thread, +1)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.review.current', thread => goToNextReview(thread, 0)));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.generate', doGenerate));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.fix', doFix));
	disposables.add(vscode.commands.registerCommand('github.copilot.chat.generateAltText', doGenerateAltText));
	// register code actions
	disposables.add(vscode.languages.registerCodeActionsProvider('*', instaService.createInstance(QuickFixesProvider), {
		providedCodeActionKinds: QuickFixesProvider.providedCodeActionKinds,
	}));
	disposables.add(vscode.languages.registerCodeActionsProvider('*', instaService.createInstance(RefactorsProvider), {
		providedCodeActionKinds: RefactorsProvider.providedCodeActionKinds,
	}));
	disposables.add(vscode.notebooks.registerNotebookCellStatusBarItemProvider(
		'jupyter-notebook',
		instaService.createInstance(NotebookExectionStatusBarItemProvider)
	));

	return disposables;
}

function fetchSuggestion(accessor: ServicesAccessor, thread: vscode.CommentThread) {
	const logService = accessor.get(ILogService);
	const reviewService = accessor.get(IReviewService);
	const instantiationService = accessor.get(IInstantiationService);
	const comment = reviewService.findReviewComment(thread);
	if (!comment || comment.suggestion || comment.skipSuggestion) {
		if (comment?.suggestion && 'edits' in comment.suggestion && comment.suggestion.edits.length && thread.contextValue?.includes('hasNoSuggestion')) {
			thread.contextValue = updateContextValue(thread.contextValue, 'hasSuggestion', 'hasNoSuggestion');
		}
		return;
	}
	comment.suggestion = (async () => {
		const message = comment.body instanceof vscode.MarkdownString ? comment.body.value : comment.body;
		const document = comment.document;

		const selection = new vscode.Selection(comment.range.start, comment.range.end);
		const textEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri.toString()) ??
			vscode.window.activeTextEditor ??
			await vscode.window.showTextDocument(document.document, { preserveFocus: true, preview: false });

		const command = Intent.Fix;
		const prompt = message;
		const request: vscode.ChatRequest = {
			location: vscode.ChatLocation.Editor,
			location2: new vscode.ChatRequestEditorData(textEditor, document.document, selection, selection),
			command,
			prompt,
			references: [],
			attempt: 0,
			enableCommandDetection: false,
			isParticipantDetected: false,
			toolReferences: [],
			toolInvocationToken: undefined as never,
			model: null!,
			tools: new Map(),
			id: '1',
			sessionId: '1',
			sessionResource: vscode.Uri.parse('chat:/1'),
			hasHooksEnabled: false,
		};
		let markdown = '';
		const edits: ReviewSuggestionChange[] = [];
		const stream = new ChatResponseStreamImpl((value) => {
			if (value instanceof vscode.ChatResponseTextEditPart && value.edits.length > 0) {
				edits.push(...value.edits.map(e => ({
					range: e.range,
					newText: e.newText,
					oldText: document.getText(e.range),
				})).filter(e => e.newText !== e.oldText));
			} else if (value instanceof vscode.ChatResponseMarkdownPart) {
				markdown += value.value.value;
			}
		}, () => { }, undefined, undefined, undefined, () => Promise.resolve(undefined));

		const requestHandler = instantiationService.createInstance(ChatParticipantRequestHandler, [], request, stream, CancellationToken.None, {
			agentId: getChatParticipantIdFromName(editorAgentName),
			agentName: editorAgentName,
			intentId: request.command,
		}, () => false, undefined);
		const result = await requestHandler.getResult();
		if (result.errorDetails) {
			throw new Error(result.errorDetails.message);
		}
		const suggestion = { markdown, edits };
		comment.suggestion = suggestion;
		reviewService.updateReviewComment(comment);
		thread.contextValue = edits.length
			? updateContextValue(thread.contextValue, 'hasSuggestion', 'hasNoSuggestion')
			: updateContextValue(thread.contextValue, 'hasNoSuggestion', 'hasSuggestion');
		return suggestion;
	})()
		.catch(err => {
			logService.error(err, 'Error fetching suggestion');
			comment.suggestion = {
				markdown: `Error fetching suggestion: ${err?.message}`,
				edits: [],
			};
			reviewService.updateReviewComment(comment);
			return comment.suggestion;
		});
	reviewService.updateReviewComment(comment);
}

function updateContextValue(value: string | undefined, add: string, remove: string) {
	return (value ? value.split(',') : [])
		.filter(v => v !== add && v !== remove)
		.concat(add)
		.sort()
		.join(',');
}

function formatSelection(selection: {
	languageId: string;
	selectedText: string;
	fileName?: string;
}): string {
	const fileContext = selection.fileName ? `From the file: ${path.basename(selection.fileName)}\n` : '';
	const { trimmedLines } = trimCommonLeadingWhitespace(selection.selectedText.split(/\r?\n/g));
	return `\n\n${fileContext}${createFencedCodeBlock(selection.languageId, coalesce(trimmedLines).join('\n'))}\n\n`;
}
