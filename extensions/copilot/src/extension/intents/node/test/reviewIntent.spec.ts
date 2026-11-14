/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../../platform/authentication/common/copilotToken';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { MockAuthenticationService } from '../../../../platform/ignore/node/test/mockAuthenticationService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IReviewService, ReviewComment } from '../../../../platform/review/common/reviewService';
import { ITabsAndEditorsService, TabInfo, TabChangeEvent } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseAnchorPart, ChatResponseCommandButtonPart, ChatResponseMarkdownPart, ChatResponseProgressPart2 } from '../../../../vscodeTypes';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { Turn } from '../../../prompt/common/conversation';
import { IResponseProcessorContext } from '../../../prompt/node/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { parseReviewScope, ReviewIntent, ReviewIntentInvocation, reviewLocalChangesMessage } from '../reviewIntent';

vi.mock('../../../review/node/githubReviewAgent', async () => {
	const actual = await vi.importActual<typeof import('../../../review/node/githubReviewAgent')>('../../../review/node/githubReviewAgent');
	return {
		...actual,
		githubReview: vi.fn(),
	};
});

import { githubReview } from '../../../review/node/githubReviewAgent';

const mockedGithubReview = vi.mocked(githubReview);

class ControllableAuthService extends MockAuthenticationService {
	private _token: CopilotToken = new CopilotToken(createTestExtendedTokenInfo({ code_review_enabled: false }));
	override getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		return Promise.resolve(this._token);
	}
	setToken(token: CopilotToken) {
		this._token = token;
	}
}

describe('parseReviewScope', () => {
	test('maps tokens (and sentinels) to scope values', () => {
		assert.deepStrictEqual(
			{
				empty: parseReviewScope(''),
				staged: parseReviewScope('staged'),
				unstaged: parseReviewScope('unstaged'),
				all: parseReviewScope('all'),
				selection: parseReviewScope('selection'),
				file: parseReviewScope('file'),
				caseInsensitive: parseReviewScope('STAGED'),
				withTrailingArg: parseReviewScope('staged extra arg'),
				unrecognised: parseReviewScope('please review'),
				scmSentinel: parseReviewScope(reviewLocalChangesMessage),
			},
			{
				empty: 'workingTree',
				staged: 'index',
				unstaged: 'workingTree',
				all: 'all',
				selection: 'selection',
				file: 'file',
				caseInsensitive: 'index',
				withTrailingArg: 'index',
				unrecognised: 'workingTree',
				scmSentinel: 'workingTree',
			}
		);
	});
});

/**
 * Minimal `IReviewService` test double tracking lifecycle calls so we can assert
 * the new chat-narrative wiring without spinning up the real Comments-panel host.
 */
class MockReviewService implements IReviewService {
	declare readonly _serviceBrand: undefined;
	private comments: ReviewComment[] = [];
	readonly addedComments: ReviewComment[] = [];
	readonly removedComments: ReviewComment[] = [];
	throwOnAdd = false;

	updateContextValues(): void { }
	isCodeFeedbackEnabled(): boolean { return true; }
	isReviewDiffEnabled(): boolean { return true; }
	isIntentEnabled(): boolean { return true; }
	getDiagnosticCollection() { return { get: () => undefined, set: () => { } }; }
	getReviewComments(): ReviewComment[] { return this.comments.slice(); }
	addReviewComments(comments: ReviewComment[], _opts?: { suppressAutoReveal?: boolean }): void {
		if (this.throwOnAdd) {
			throw new Error('addReviewComments boom');
		}
		this.addedComments.push(...comments);
		this.comments.push(...comments);
	}
	collapseReviewComment(_comment: ReviewComment): void { }
	removeReviewComments(comments: ReviewComment[]): void {
		this.removedComments.push(...comments);
		this.comments = this.comments.filter(c => !comments.includes(c));
	}
	updateReviewComment(_comment: ReviewComment): void { }
	findReviewComment() { return undefined; }
	findCommentThread() { return undefined; }
	getActiveThread(): vscode.CommentThread | undefined { return undefined; }
	/** Test helper: seed pre-existing comments without recording them in `addedComments`. */
	seed(...comments: ReviewComment[]): void {
		this.comments.push(...comments);
	}
}

function makeComment(uriPath: string, line: number, body: string, kind = 'bug', severity = 'medium'): ReviewComment {
	return {
		uri: { fsPath: uriPath, toString: () => `file://${uriPath}` } as unknown as vscode.Uri,
		range: { start: { line, character: 0 }, end: { line, character: 0 } } as unknown as vscode.Range,
		body,
		kind,
		severity,
	} as unknown as ReviewComment;
}

/**
 * Configurable `ITabsAndEditorsService` test double so tests can drive the
 * active-editor branch of `processResponse` (e.g. for the `file` scope path).
 */
class MockTabsAndEditorsService implements ITabsAndEditorsService {
	declare readonly _serviceBrand: undefined;
	activeTextEditor: vscode.TextEditor | undefined = undefined;
	readonly visibleTextEditors: readonly vscode.TextEditor[] = [];
	readonly activeNotebookEditor: vscode.NotebookEditor | undefined = undefined;
	readonly visibleNotebookEditors: readonly vscode.NotebookEditor[] = [];
	readonly tabs: TabInfo[] = [];
	readonly onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined> = Event.None;
	readonly onDidChangeTabs: vscode.Event<TabChangeEvent> = Event.None;
}

describe('ReviewIntentInvocation processResponse (Panel)', () => {
	let disposables: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let authService: ControllableAuthService;
	let reviewService: MockReviewService;
	let tabsService: MockTabsAndEditorsService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = createExtensionUnitTestingServices();
		authService = new ControllableAuthService();
		reviewService = new MockReviewService();
		tabsService = new MockTabsAndEditorsService();
		services.define(IAuthenticationService, authService);
		services.define(IReviewService, reviewService);
		services.define(ITabsAndEditorsService, tabsService);
		accessor = services.createTestingAccessor();
		disposables.add(accessor);
		instantiationService = accessor.get(IInstantiationService);
		mockedGithubReview.mockReset();
	});

	afterEach(() => {
		disposables.dispose();
	});

	function enableCodeReview() {
		authService.setToken(new CopilotToken(createTestExtendedTokenInfo({ code_review_enabled: true })));
	}

	function makeContext(message: string): IResponseProcessorContext {
		const turn = new Turn('turn-1', { type: 'user', message });
		return {
			chatSessionId: 'session-1',
			turn,
			messages: [],
		} as unknown as IResponseProcessorContext;
	}

	async function createInvocation(): Promise<ReviewIntentInvocation> {
		const intent = instantiationService.createInstance(ReviewIntent);
		const invocation = await intent.invoke({
			location: ChatLocation.Panel,
			request: new TestChatRequest('') as any,
			documentContext: undefined,
		});
		return invocation as ReviewIntentInvocation;
	}

	async function emptyStream(): Promise<AsyncIterable<never>> {
		return (async function* () { })();
	}

	function makeTrackingStream(): { stream: MockChatResponseStream; getButtons: () => vscode.Command[] } {
		const parts: vscode.ExtendedChatResponsePart[] = [];
		const stream = new MockChatResponseStream(part => parts.push(part));
		const getButtons = () => parts
			.filter((p): p is ChatResponseCommandButtonPart => p instanceof ChatResponseCommandButtonPart)
			.map(p => p.value);
		return { stream, getButtons };
	}

	/**
	 * Parts-capturing stream for tests that need to inspect the ordering of
	 * markdown / anchor / button emissions, or the underlying `MarkdownString`
	 * instances on the summary block.
	 */
	function makePartsStream(): {
		stream: ChatResponseStreamImpl;
		parts: vscode.ExtendedChatResponsePart[];
		output: string[];
		getButtons: () => vscode.Command[];
		findSummaryPart: () => ChatResponseMarkdownPart | undefined;
	} {
		const parts: vscode.ExtendedChatResponsePart[] = [];
		const output: string[] = [];
		const stream = new ChatResponseStreamImpl(
			part => {
				parts.push(part);
				if (part instanceof ChatResponseMarkdownPart) {
					output.push(part.value.value);
				}
			},
			() => { },
		);
		const getButtons = () => parts
			.filter((p): p is ChatResponseCommandButtonPart => p instanceof ChatResponseCommandButtonPart)
			.map(p => p.value);
		const findSummaryPart = () => parts.find((p): p is ChatResponseMarkdownPart =>
			p instanceof ChatResponseMarkdownPart && p.value.value.includes('**Findings by file**')
		);
		return { stream, parts, output, getButtons, findSummaryPart };
	}

	test('refuses when code review is not enabled', async () => {
		// Default token has code_review_enabled: false
		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext(''), await emptyStream(), stream, CancellationToken.None);

		expect(mockedGithubReview).not.toHaveBeenCalled();
		expect(stream.output.join('\n')).toMatch(/not available/i);
	});

	test('happy path: pushes comments to review service, narrates milestones, renders buttons (no markdown dump)', async () => {
		enableCodeReview();
		const sampleComments = [makeComment('/workspace/foo.ts', 9, 'Consider renaming this variable.')];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report(sampleComments);
			return { type: 'success', comments: sampleComments };
		});

		const invocation = await createInvocation();
		const { stream, parts, output, getButtons } = makePartsStream();
		await invocation.processResponse!(makeContext('staged'), await emptyStream(), stream, CancellationToken.None);

		const out = output.join('');
		// Phase 1 markdown dump must be gone.
		expect(out).not.toMatch(/### .*foo\.ts:10/);
		expect(out).not.toMatch(/\n---\n/);
		// Phase 4c (Bug 3): per-finding stream block deleted; no anchor parts, no "Found ..." narration.
		expect(parts.find(p => p instanceof ChatResponseAnchorPart)).toBeUndefined();
		expect(out).not.toMatch(/Found medium bug in/);
		// Narrative milestones in order: header → completion summary.
		const reviewing = out.indexOf('Reviewing');
		const complete = out.indexOf('Review complete');
		expect(reviewing).toBeGreaterThanOrEqual(0);
		expect(complete).toBeGreaterThan(reviewing);
		expect(out).toMatch(/Review complete: 1 findings across 1 files/);
		// Comments-panel wiring.
		expect(reviewService.addedComments).toEqual(sampleComments);
		// Buttons: single consolidated "Next Comment" button.
		const buttons = getButtons();
		expect(buttons).toHaveLength(1);
		expect(buttons[0].command).toBe('github.copilot.chat.review.nextFromChat');
		expect(buttons[0].title).toBe('Next Comment');
	});

	test('regression (Phase 2): addReviewComments is called with each streamed comment in the streaming path', async () => {
		enableCodeReview();
		const streamed = [
			makeComment('/workspace/a.ts', 0, 'a1'),
			makeComment('/workspace/b.ts', 1, 'b1'),
			makeComment('/workspace/c.ts', 2, 'c1'),
		];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			// Report comments in separate batches to exercise the per-batch add path.
			progress.report([streamed[0]]);
			progress.report([streamed[1], streamed[2]]);
			return { type: 'success', comments: streamed };
		});

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		expect(reviewService.addedComments).toEqual(streamed);
	});

	test('summary suppressed when total findings < 5', async () => {
		enableCodeReview();
		const four = [
			makeComment('/workspace/a.ts', 0, 'a1'),
			makeComment('/workspace/a.ts', 1, 'a2'),
			makeComment('/workspace/b.ts', 0, 'b1'),
			makeComment('/workspace/b.ts', 1, 'b2'),
		];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report(four);
			return { type: 'success', comments: four };
		});

		const invocation = await createInvocation();
		const { stream, output, findSummaryPart } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		expect(findSummaryPart()).toBeUndefined();
		expect(output.join('')).not.toMatch(/Findings by file/);
	});

	test('summary emitted when total findings >= 5 with A→Z group ordering', async () => {
		enableCodeReview();
		// Emit zzz.ts first so we can assert the summary re-orders to aaa.ts → zzz.ts.
		const comments = [
			makeComment('/workspace/zzz.ts', 0, 'z1'),
			makeComment('/workspace/zzz.ts', 1, 'z2'),
			makeComment('/workspace/zzz.ts', 2, 'z3'),
			makeComment('/workspace/aaa.ts', 0, 'a1'),
			makeComment('/workspace/aaa.ts', 1, 'a2'),
		];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report(comments);
			return { type: 'success', comments };
		});

		const invocation = await createInvocation();
		const { stream, findSummaryPart } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		const summary = findSummaryPart();
		expect(summary).toBeDefined();
		const summaryText = summary!.value.value;
		const aIdx = summaryText.indexOf('/workspace/aaa.ts');
		const zIdx = summaryText.indexOf('/workspace/zzz.ts');
		expect(aIdx).toBeGreaterThan(-1);
		expect(zIdx).toBeGreaterThan(aIdx);
	});

	test('per-file `### relPath (N findings)` heading: singular vs plural form, always expanded (no HTML)', async () => {
		enableCodeReview();
		const many = [
			makeComment('/workspace/many.ts', 0, 'm1'),
			makeComment('/workspace/many.ts', 1, 'm2'),
			makeComment('/workspace/many.ts', 2, 'm3'),
			makeComment('/workspace/many.ts', 3, 'm4'),
		];
		const few = [makeComment('/workspace/few.ts', 0, 'f1')];
		const all = [...many, ...few];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report(all);
			return { type: 'success', comments: all };
		});

		const invocation = await createInvocation();
		const { stream, findSummaryPart } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		const summary = findSummaryPart()!;
		const summaryText = summary.value.value;
		// Plain-markdown headings (no <details>/<summary> HTML), singular + plural.
		expect(summaryText).toMatch(/^### [^\n]*few\.ts \(1 finding\)$/m);
		expect(summaryText).toMatch(/^### [^\n]*many\.ts \(4 findings\)$/m);
		expect(summaryText).not.toMatch(/<details/);
		expect(summaryText).not.toMatch(/<summary/);
		// Summary MarkdownString must NOT opt into HTML rendering.
		expect(summary.value.supportHtml).not.toBe(true);
	});

	test('excluded comments folded into the same file group with ` (filtered)` suffix', async () => {
		enableCodeReview();
		const kept = [
			makeComment('/workspace/mixed.ts', 0, 'k1'),
			makeComment('/workspace/mixed.ts', 1, 'k2'),
			makeComment('/workspace/mixed.ts', 2, 'k3'),
		];
		const dropped = [
			makeComment('/workspace/mixed.ts', 3, 'd1'),
			makeComment('/workspace/mixed.ts', 4, 'd2'),
		];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report(kept);
			return { type: 'success', comments: kept, excludedComments: dropped };
		});

		const invocation = await createInvocation();
		const { stream, findSummaryPart } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		const summaryText = findSummaryPart()!.value.value;
		// Single group with all 5 entries rendered as a plain markdown heading.
		expect(summaryText).toMatch(/^### [^\n]*mixed\.ts \(5 findings\)$/m);
		// Filtered entries get the suffix; kept entries do not. Links use basename:line.
		expect(summaryText).toMatch(/- \[mixed\.ts:4\].*: d1 \(filtered\)/);
		expect(summaryText).toMatch(/- \[mixed\.ts:5\].*: d2 \(filtered\)/);
		expect(summaryText).toMatch(/- \[mixed\.ts:1\].*: k1(?! \(filtered\))/);
		// Phase 4c (Bug 1): summary links use scoped command URI + isTrusted whitelists only the reveal command.
		expect(summaryText).toMatch(/command:github\.copilot\.chat\.review\.revealComment\?/);
		expect(findSummaryPart()!.value.isTrusted).toEqual({ enabledCommands: ['github.copilot.chat.review.revealComment'] });
	});

	test('propagates the cancellation token to githubReview', async () => {
		enableCodeReview();
		mockedGithubReview.mockResolvedValue({ type: 'cancelled' });
		const cts = new CancellationTokenSource();
		disposables.add(cts);

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('unstaged'), await emptyStream(), stream, cts.token);

		const [, , , , , , , , , , , , , token] = mockedGithubReview.mock.calls[0];
		expect(token).toBe(cts.token);
	});

	test('renders a graceful error message on FeedbackResult error and no buttons', async () => {
		enableCodeReview();
		mockedGithubReview.mockResolvedValue({ type: 'error', reason: 'boom' });

		const invocation = await createInvocation();
		const { stream, getButtons } = makeTrackingStream();
		await invocation.processResponse!(makeContext(''), await emptyStream(), stream, CancellationToken.None);

		expect(stream.output.join('')).toMatch(/Review failed: boom/);
		expect(getButtons()).toHaveLength(0);
	});

	test('empty success renders "no issues" narrative and no buttons', async () => {
		enableCodeReview();
		mockedGithubReview.mockResolvedValue({ type: 'success', comments: [] });

		const invocation = await createInvocation();
		const { stream, getButtons } = makeTrackingStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		expect(stream.output.join('')).toMatch(/No issues found/);
		expect(getButtons()).toHaveLength(0);
	});

	test('cancel mid-stream: streamed comments are added then rolled back, "Review cancelled." narrated', async () => {
		enableCodeReview();
		const cts = new CancellationTokenSource();
		disposables.add(cts);
		const streamed = [makeComment('/workspace/a.ts', 0, 'a'), makeComment('/workspace/b.ts', 1, 'b')];
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report([streamed[0]]);
			progress.report([streamed[1]]);
			cts.cancel();
			return { type: 'cancelled' };
		});

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, cts.token);

		expect(reviewService.addedComments).toEqual(streamed);
		expect(reviewService.removedComments).toEqual(streamed);
		expect(stream.output.join('')).toMatch(/Review cancelled\./);
	});

	test('comment reported after cancel: not added to review service', async () => {
		enableCodeReview();
		const cts = new CancellationTokenSource();
		disposables.add(cts);
		const lateComment = makeComment('/workspace/late.ts', 2, 'late');
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			cts.cancel();
			progress.report([lateComment]);
			return { type: 'cancelled' };
		});

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, cts.token);

		expect(reviewService.addedComments).toEqual([]);
	});

	test('addReviewComments throws: degrades to graceful narrative, no unhandled rejection', async () => {
		enableCodeReview();
		reviewService.throwOnAdd = true;
		const comment = makeComment('/workspace/foo.ts', 0, 'foo');
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report([comment]);
			return { type: 'success', comments: [comment] };
		});

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		expect(stream.output.join('')).toMatch(/could not update Comments panel/);
	});

	test('excludedComments on success: added to review service and a subline narrates the filter count', async () => {
		enableCodeReview();
		const kept = makeComment('/workspace/keep.ts', 0, 'keep');
		const filtered = makeComment('/workspace/filter.ts', 0, 'filter');
		mockedGithubReview.mockImplementation(async (...args: any[]) => {
			const progress = args[12];
			progress.report([kept]);
			return { type: 'success', comments: [kept], excludedComments: [filtered] };
		});

		const invocation = await createInvocation();
		const { stream, getButtons } = makeTrackingStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		expect(reviewService.addedComments).toEqual([kept, filtered]);
		expect(stream.output.join('')).toMatch(/1 comments filtered by policy/);
		expect(getButtons().map(b => b.command)).toEqual(['github.copilot.chat.review.nextFromChat']);
	});

	test('scope-aware pre-clear ("file" scope): removes only existing comments matching the active file URI', async () => {
		enableCodeReview();
		const fooUri = { fsPath: '/workspace/foo.ts', toString: () => 'file:///workspace/foo.ts' } as unknown as vscode.Uri;
		const barUri = { fsPath: '/workspace/bar.ts', toString: () => 'file:///workspace/bar.ts' } as unknown as vscode.Uri;
		const fooComment = { ...makeComment('/workspace/foo.ts', 0, 'foo'), uri: fooUri } as ReviewComment;
		const barComment = { ...makeComment('/workspace/bar.ts', 0, 'bar'), uri: barUri } as ReviewComment;
		reviewService.seed(fooComment, barComment);
		tabsService.activeTextEditor = { document: { uri: fooUri }, selection: { isEmpty: true } } as unknown as vscode.TextEditor;
		mockedGithubReview.mockResolvedValue({ type: 'success', comments: [] });

		const invocation = await createInvocation();
		const stream = new MockChatResponseStream();
		await invocation.processResponse!(makeContext('file'), await emptyStream(), stream, CancellationToken.None);

		expect(reviewService.removedComments).toEqual([fooComment]);
	});

	test('task-bound progress: emits exactly one ChatResponseProgressPart2 with a task callback, independent of phase callbacks', async () => {
		enableCodeReview();
		// Mock returns success without firing any phase callback. The early
		// task-bound progress must still be emitted because it is pinned at the
		// top of `processResponse`, before `await githubReview(...)`.
		mockedGithubReview.mockImplementation(async () => {
			return { type: 'success', comments: [] };
		});

		const invocation = await createInvocation();
		const { stream, parts } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		const progressParts = parts.filter((p): p is ChatResponseProgressPart2 => p instanceof ChatResponseProgressPart2);
		expect(progressParts).toHaveLength(1);
		expect(progressParts[0].value).toBe('Analyzing your changes…');
		expect(typeof progressParts[0].task).toBe('function');
	});

	test('task-bound progress: task callback resolves with the success summary after the review settles', async () => {
		enableCodeReview();
		// 3 comments across 3 distinct files → `filesWithComments` = 3.
		const comments = [
			makeComment('/workspace/a.ts', 0, 'a1'),
			makeComment('/workspace/b.ts', 1, 'b1'),
			makeComment('/workspace/c.ts', 2, 'c1'),
		];
		mockedGithubReview.mockImplementation(async () => {
			return { type: 'success', comments };
		});

		const invocation = await createInvocation();
		const { stream, parts } = makePartsStream();
		await invocation.processResponse!(makeContext('all'), await emptyStream(), stream, CancellationToken.None);

		const part = parts.find((p): p is ChatResponseProgressPart2 => p instanceof ChatResponseProgressPart2);
		expect(part).toBeDefined();
		// `reviewComplete` has already been settled by the success branch, so the
		// task callback resolves immediately with the cached value.
		const taskResult = await part!.task!({ report: () => { } });
		expect(taskResult).toBe('Review complete: 3 findings across 3 files');
	});
});

describe('ReviewIntentInvocation.buildPrompt (Panel)', () => {
	let disposables: DisposableStore;
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;

	beforeEach(() => {
		disposables = new DisposableStore();
		const services = createExtensionUnitTestingServices();
		services.define(IReviewService, new MockReviewService());
		services.define(ITabsAndEditorsService, new MockTabsAndEditorsService());
		accessor = services.createTestingAccessor();
		disposables.add(accessor);
		instantiationService = accessor.get(IInstantiationService);
	});

	afterEach(() => {
		disposables.dispose();
	});

	test('returns the null prompt result on the Panel (chat) path', async () => {
		const invocation = instantiationService.createInstance(
			ReviewIntentInvocation,
			{ id: 'review' } as any,
			ChatLocation.Panel,
			{} as IChatEndpoint,
			undefined as any,
		);
		const result = await invocation.buildPrompt(
			{ query: '', history: [], chatVariables: { variables: [] } } as any,
			{ report: () => { } },
			CancellationToken.None,
		);
		expect(result.messages).toEqual([]);
		expect(result.references).toEqual([]);
	});
});
