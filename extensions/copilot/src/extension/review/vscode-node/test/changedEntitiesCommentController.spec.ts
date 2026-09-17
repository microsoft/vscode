/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import * as vscode from 'vscode';
import { beforeEach, suite, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	commandHandlers: new Map<string, (...args: never[]) => unknown>(),
	commentController: undefined as vscode.CommentController | undefined,
	executeCommand: vi.fn(),
	showWarningMessage: vi.fn(),
}));

vi.mock('vscode', async importOriginal => {
	const actual = await importOriginal<typeof import('vscode')>();
	return {
		...actual,
		CommentMode: {
			Editing: 0,
			Preview: 1,
		},
		CommentThreadCollapsibleState: {
			Collapsed: 0,
			Expanded: 1,
		},
		CommentThreadState: {
			Unresolved: 0,
			Resolved: 1,
		},
		commands: {
			executeCommand: mocks.executeCommand,
			registerCommand: (command: string, handler: (...args: never[]) => unknown) => {
				mocks.commandHandlers.set(command, handler);
				return { dispose: () => mocks.commandHandlers.delete(command) };
			},
		},
		comments: {
			createCommentController: (id: string, label: string) => {
				const controller = {
					id,
					label,
					createCommentThread: vi.fn(),
					dispose: vi.fn(),
				} as unknown as vscode.CommentController;
				mocks.commentController = controller;
				return controller;
			},
		},
		window: {
			...actual.window,
			showWarningMessage: mocks.showWarningMessage,
		},
		workspace: {
			...actual.workspace,
			asRelativePath: (uri: vscode.Uri) => `src\\${uri.path.split('/').at(-1)}`,
		},
	};
});

import type { CodeReviewCommentLocation, ICodeReviewService, TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptChangeExplanation, TypeScriptChangeExplanationInput, TypeScriptMetricsResult, TypeScriptReviewLineChange } from '../../../../platform/languageContextProvider/common/codeReviewService';
import type { ILogService } from '../../../../platform/log/common/logService';
import { Emitter } from '../../../../util/vs/base/common/event';
import { ChangedEntitiesCommentControllerContribution, changedEntitiesCommentControllerId, discardChangedEntitiesCommentCommand, pendingChangedEntitiesCommentsContext, saveChangedEntitiesCommentCommand, sendChangedEntitiesCommentsCommand } from '../changedEntitiesCommentController';

suite('Changed entities comment controller', () => {
	beforeEach(() => {
		mocks.commandHandlers.clear();
		mocks.commentController = undefined;
		mocks.executeCommand.mockReset();
		mocks.executeCommand.mockResolvedValue(undefined);
		mocks.showWarningMessage.mockReset();
	});

	test('stores modified-side comments and opens one Agent chat draft', async () => {
		const service = new TestCodeReviewService();
		const contribution = new ChangedEntitiesCommentControllerContribution(service, { error: vi.fn() } as unknown as ILogService);
		try {
			const controller = mocks.commentController;
			assert.ok(controller !== undefined);
			const firstUri = reviewUri('review-a', 'modified', 'a.ts');
			const secondUri = reviewUri('review-b', 'modified', 'b.ts');
			const originalUri = reviewUri('review-a', 'original', 'a.ts');
			const firstRange = new vscode.Range(2, 1, 2, 8);
			const secondRange = new vscode.Range(4, 0, 6, 0);
			const firstThread = createThread(firstUri, firstRange);
			const secondThread = createThread(secondUri, secondRange);

			const commentingRanges = await controller.commentingRangeProvider?.provideCommentingRanges(
				{ uri: firstUri } as vscode.TextDocument,
				{} as vscode.CancellationToken,
			);
			const originalCommentingRanges = await controller.commentingRangeProvider?.provideCommentingRanges(
				{ uri: originalUri } as vscode.TextDocument,
				{} as vscode.CancellationToken,
			);
			await runCommand(saveChangedEntitiesCommentCommand, { thread: firstThread, text: '  Handle the empty value.  ' } satisfies vscode.CommentReply);
			await runCommand(saveChangedEntitiesCommentCommand, { thread: secondThread, text: 'Avoid allocating this temporary array.' } satisfies vscode.CommentReply);

			const callsBeforeSend = mocks.executeCommand.mock.calls.filter(call => call[0] === 'workbench.action.chat.open');
			await runCommand(sendChangedEntitiesCommentsCommand);
			const chatCalls = mocks.executeCommand.mock.calls.filter(call => call[0] === 'workbench.action.chat.open');
			const options = chatCalls[0][1] as {
				readonly query: string;
				readonly isPartialQuery: boolean;
				readonly mode: string;
				readonly attachFiles: readonly { readonly uri: vscode.Uri; readonly range: vscode.Range }[];
			};
			const promptEntries = JSON.parse(options.query.slice(options.query.indexOf('\n\n') + 2));
			const pendingCountAfterSend = getLastPendingCount();
			const secondThreadDisposedAfterSend = (secondThread.dispose as ReturnType<typeof vi.fn>).mock.calls.length;

			service.invalidate('review-a');
			const pendingCountAfterInvalidation = getLastPendingCount();
			await runCommand(discardChangedEntitiesCommentCommand, secondThread);

			assert.deepStrictEqual({
				controller: {
					id: controller.id,
					label: controller.label,
					options: controller.options,
				},
				commentingRanges: serializeRanges(commentingRanges),
				originalCommentingRanges: serializeRanges(originalCommentingRanges),
				firstThread: serializeThread(firstThread),
				secondThreadBeforeDiscard: {
					comments: secondThread.comments.map(comment => comment.body),
					disposed: secondThreadDisposedAfterSend,
				},
				chat: {
					callsBeforeSend: callsBeforeSend.length,
					callCount: chatCalls.length,
					isPartialQuery: options.isPartialQuery,
					mode: options.mode,
					promptEntries,
					attachments: options.attachFiles.map(attachment => ({
						path: attachment.uri.fsPath,
						range: serializeRange(attachment.range),
					})),
					pendingCountAfterSend,
				},
				invalidation: {
					firstDisposed: (firstThread.dispose as ReturnType<typeof vi.fn>).mock.calls.length,
					pendingCountAfterInvalidation,
				},
				discard: {
					secondDisposed: (secondThread.dispose as ReturnType<typeof vi.fn>).mock.calls.length,
					pendingCount: getLastPendingCount(),
				},
			}, {
				controller: {
					id: changedEntitiesCommentControllerId,
					label: 'Changed Entities Review',
					options: {
						prompt: 'Add a comment for Copilot',
						placeHolder: 'Describe what Copilot should change',
					},
				},
				commentingRanges: [[1, 3]],
				originalCommentingRanges: [],
				firstThread: {
					comments: ['Handle the empty value.'],
					canReply: false,
					collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
					contextValue: 'copilotChangedEntitiesPendingComment',
					label: 'Pending Copilot comment',
					state: vscode.CommentThreadState.Unresolved,
				},
				secondThreadBeforeDiscard: {
					comments: ['Avoid allocating this temporary array.'],
					disposed: 0,
				},
				chat: {
					callsBeforeSend: 0,
					callCount: 1,
					isPartialQuery: true,
					mode: 'agent',
					promptEntries: [
						{
							file: 'src\\a.ts',
							startLine: 3,
							endLine: 3,
							comment: 'Handle the empty value.',
						},
						{
							file: 'src\\b.ts',
							startLine: 5,
							endLine: 6,
							comment: 'Avoid allocating this temporary array.',
						},
					],
					attachments: [
						{
							path: 'c:\\workspace\\src\\a.ts',
							range: [2, 1, 2, 8],
						},
						{
							path: 'c:\\workspace\\src\\b.ts',
							range: [4, 0, 6, 0],
						},
					],
					pendingCountAfterSend: 2,
				},
				invalidation: {
					firstDisposed: 1,
					pendingCountAfterInvalidation: 1,
				},
				discard: {
					secondDisposed: 1,
					pendingCount: 0,
				},
			});
		} finally {
			contribution.dispose();
			service.dispose();
		}
	});

	test('rejects empty and stale comments without opening Chat', async () => {
		const service = new TestCodeReviewService();
		const contribution = new ChangedEntitiesCommentControllerContribution(service, { error: vi.fn() } as unknown as ILogService);
		try {
			const thread = createThread(reviewUri('review-a', 'original', 'a.ts'), new vscode.Range(1, 0, 1, 0));
			await runCommand(saveChangedEntitiesCommentCommand, { thread, text: '   ' } satisfies vscode.CommentReply);
			await runCommand(saveChangedEntitiesCommentCommand, { thread, text: 'Change this.' } satisfies vscode.CommentReply);
			await runCommand(sendChangedEntitiesCommentsCommand);

			assert.deepStrictEqual({
				warnings: mocks.showWarningMessage.mock.calls.map(call => call[0]),
				threadDisposed: (thread.dispose as ReturnType<typeof vi.fn>).mock.calls.length,
				chatCalls: mocks.executeCommand.mock.calls.filter(call => call[0] === 'workbench.action.chat.open').length,
			}, {
				warnings: [
					'Enter a review comment before saving it.',
					'This code review location is no longer available. Reopen the entity diff and try again.',
					'There are no pending review comments to send to Copilot.',
				],
				threadDisposed: 1,
				chatCalls: 0,
			});
		} finally {
			contribution.dispose();
			service.dispose();
		}
	});
});

class TestCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;
	private readonly invalidationEmitter = new Emitter<string>();
	readonly onDidInvalidateReview = this.invalidationEmitter.event;

	async computeMetrics(): Promise<TypeScriptMetricsResult | undefined> {
		return undefined;
	}

	async classifyChanges(_input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		return undefined;
	}

	async explainChanges(_input: TypeScriptChangeExplanationInput): Promise<readonly TypeScriptChangeExplanation[] | undefined> {
		return undefined;
	}

	setChangesReviewed(_entityLink: vscode.Uri, _changes: readonly TypeScriptReviewLineChange[], _reviewed: boolean): boolean {
		return false;
	}

	getCommentingRanges(uri: vscode.Uri): readonly vscode.Range[] {
		return getReviewSide(uri) === 'modified' ? [new vscode.Range(1, 0, 3, Number.MAX_SAFE_INTEGER)] : [];
	}

	resolveCommentLocation(uri: vscode.Uri, range: vscode.Range): CodeReviewCommentLocation | undefined {
		const reviewId = new URLSearchParams(uri.query).get('id');
		if (reviewId === null || getReviewSide(uri) !== 'modified') {
			return undefined;
		}
		return {
			reviewId,
			uri: vscode.Uri.file(`C:\\workspace\\src\\${uri.path.split('/').at(-1)}`),
			range,
		};
	}

	invalidate(reviewId: string): void {
		this.invalidationEmitter.fire(reviewId);
	}

	async openDiff(): Promise<void> { }

	dispose(): void {
		this.invalidationEmitter.dispose();
	}
}

function reviewUri(reviewId: string, side: 'original' | 'modified', fileName: string): vscode.Uri {
	return vscode.Uri.from({
		scheme: 'copilot-code-review',
		path: `/C:/workspace/src/${fileName}`,
		query: new URLSearchParams({ id: reviewId, side }).toString(),
	});
}

function getReviewSide(uri: vscode.Uri): string | null {
	return new URLSearchParams(uri.query).get('side');
}

function createThread(uri: vscode.Uri, range: vscode.Range): vscode.CommentThread {
	return {
		uri,
		range,
		comments: [],
		collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
		canReply: true,
		dispose: vi.fn(),
	};
}

async function runCommand(command: string, ...args: unknown[]): Promise<void> {
	const handler = mocks.commandHandlers.get(command);
	assert.ok(handler !== undefined);
	await handler(...args as never[]);
}

function getLastPendingCount(): number | undefined {
	return mocks.executeCommand.mock.calls
		.filter(call => call[0] === 'setContext' && call[1] === pendingChangedEntitiesCommentsContext)
		.at(-1)?.[2];
}

function serializeThread(thread: vscode.CommentThread): object {
	return {
		comments: thread.comments.map(comment => comment.body),
		canReply: thread.canReply,
		collapsibleState: thread.collapsibleState,
		contextValue: thread.contextValue,
		label: thread.label,
		state: thread.state,
	};
}

function serializeRanges(ranges: vscode.Range[] | vscode.CommentingRanges | null | undefined): number[][] | undefined {
	if (ranges === null || ranges === undefined || !Array.isArray(ranges)) {
		return undefined;
	}
	return ranges.map(range => [range.start.line, range.end.line]);
}

function serializeRange(range: vscode.Range): number[] {
	return [range.start.line, range.start.character, range.end.line, range.end.character];
}
