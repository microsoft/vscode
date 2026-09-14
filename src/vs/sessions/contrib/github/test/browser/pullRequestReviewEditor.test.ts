/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorPaneRegistry } from '../../../../../workbench/browser/editor.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { EditorExtensions, EditorInputCapabilities, IEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService, MODAL_GROUP, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { TestEditorGroupView, TestEditorService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IGitHubPullRequestRef } from '../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';
import { OpenPullRequestReviewAction, PullRequestReviewEditor, PullRequestReviewEditorInput, PullRequestReviewModel } from '../../browser/pullRequestReviewEditor.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPullRequest, IGitHubPullRequestReview, IGitHubPullRequestReviewThread, OPEN_PULL_REQUEST_REVIEW_ACTION_ID } from '../../common/types.js';

function makeRef(number = 42): IGitHubPullRequestRef {
	return { owner: 'microsoft', repo: 'vscode', number, uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`) };
}

function makePullRequest(number = 42, headSha = 'head-1'): IGitHubPullRequest {
	return {
		number,
		title: `Live pull request ${number}`,
		body: 'A **real** description.',
		state: GitHubPullRequestState.Open,
		author: { login: 'author', avatarUrl: '' },
		headRef: 'feature',
		headSha,
		baseRef: 'main',
		isDraft: false,
		createdAt: '2026-09-01T00:00:00Z',
		updatedAt: '2026-09-02T00:00:00Z',
		mergedAt: undefined,
		mergeable: true,
		mergeableState: 'clean',
	};
}

function makeCheck(conclusion = GitHubCheckConclusion.Success): IGitHubCICheck {
	return {
		id: 1, name: 'Build', status: GitHubCheckStatus.Completed, conclusion,
		startedAt: undefined, completedAt: undefined, detailsUrl: undefined,
	};
}

class TestPullRequestModel extends mock<GitHubPullRequestModel>() {
	override readonly pullRequest = observableValue<IGitHubPullRequest | undefined>(this, undefined);
	override readonly reviews = observableValue<readonly IGitHubPullRequestReview[] | undefined>(this, undefined);
	nextPullRequest: IGitHubPullRequest | undefined = makePullRequest();
	nextReviews: readonly IGitHubPullRequestReview[] = [];
	gate: DeferredPromise<void> | undefined;
	error: Error | undefined;
	refreshCount = 0;

	override async refresh(): Promise<void> {
		this.refreshCount++;
		await this.gate?.p;
		if (this.error) {
			throw this.error;
		}
		transaction(tx => {
			this.pullRequest.set(this.nextPullRequest, tx);
			this.reviews.set(this.nextPullRequest ? this.nextReviews : undefined, tx);
		});
	}

	override startPolling(): never {
		throw new Error('The review viewer must not start polling');
	}
}

class TestReviewThreadsModel extends mock<GitHubPullRequestReviewThreadsModel>() {
	override readonly reviewThreads = observableValue<readonly IGitHubPullRequestReviewThread[]>(this, []);
	override readonly hasLoaded = observableValue(this, false);
	override readonly initialRefreshCompleted = observableValue(this, false);
	nextThreads: readonly IGitHubPullRequestReviewThread[] = [];
	gate: DeferredPromise<void> | undefined;
	error: Error | undefined;
	refreshCount = 0;

	override async refresh(): Promise<void> {
		this.refreshCount++;
		await this.gate?.p;
		if (this.error) {
			this.initialRefreshCompleted.set(true, undefined);
			throw this.error;
		}
		transaction(tx => {
			this.reviewThreads.set(this.nextThreads, tx);
			this.hasLoaded.set(true, tx);
			this.initialRefreshCompleted.set(true, tx);
		});
	}

	override startPolling(): never {
		throw new Error('The review viewer must not start polling');
	}
}

class TestCIModel extends mock<GitHubPullRequestCIModel>() {
	override readonly checks = observableValue<readonly IGitHubCICheck[]>(this, []);
	nextChecks: readonly IGitHubCICheck[] = [makeCheck()];
	gate: DeferredPromise<void> | undefined;
	error: Error | undefined;
	refreshCount = 0;

	override async refresh(): Promise<void> {
		this.refreshCount++;
		await this.gate?.p;
		if (this.error) {
			throw this.error;
		}
		this.checks.set(this.nextChecks, undefined);
	}

	override startPolling(): never {
		throw new Error('The review viewer must not start polling');
	}
}

class TestGitHubService extends mock<IGitHubService>() {
	readonly details = new Map<number, TestPullRequestModel>();
	readonly threads = new Map<number, TestReviewThreadsModel>();
	readonly checks = new Map<string, TestCIModel>();
	readonly acquired: string[] = [];
	readonly released: string[] = [];

	add(ref: IGitHubPullRequestRef): { details: TestPullRequestModel; threads: TestReviewThreadsModel; checks: TestCIModel } {
		const details = new TestPullRequestModel();
		details.nextPullRequest = makePullRequest(ref.number);
		const threads = new TestReviewThreadsModel();
		const checks = new TestCIModel();
		this.details.set(ref.number, details);
		this.threads.set(ref.number, threads);
		this.checks.set(`${ref.number}/head-1`, checks);
		return { details, threads, checks };
	}

	private reference<T>(key: string, object: T): IReference<T> {
		this.acquired.push(key);
		return Object.assign(toDisposable(() => this.released.push(key)), { object });
	}

	override createPullRequestModelReference(owner: string, repo: string, number: number): IReference<GitHubPullRequestModel> {
		const model = this.details.get(number);
		assert.ok(model);
		return this.reference(`${owner}/${repo}/${number}/details`, model);
	}

	override createPullRequestReviewThreadsModelReference(owner: string, repo: string, number: number): IReference<GitHubPullRequestReviewThreadsModel> {
		const model = this.threads.get(number);
		assert.ok(model);
		return this.reference(`${owner}/${repo}/${number}/threads`, model);
	}

	override createPullRequestCIModelReference(owner: string, repo: string, number: number, headSha: string): IReference<GitHubPullRequestCIModel> {
		const model = this.checks.get(`${number}/${headSha}`);
		assert.ok(model);
		return this.reference(`${owner}/${repo}/${number}/${headSha}`, model);
	}
}

suite('Pull Request Review Editor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(gitHubService: IGitHubService) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IGitHubService, gitHubService);
		const opened: { resource: URI | string; options: OpenOptions | undefined }[] = [];
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(resource: URI | string, options?: OpenOptions): Promise<boolean> {
				opened.push({ resource, options });
				return true;
			}
		});
		const editor = store.add(instantiationService.createInstance(PullRequestReviewEditor, new TestEditorGroupView(1)));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		editor.create(container);
		editor.layout(new dom.Dimension(640, 480));
		return { editor, container, opened };
	}

	test('input identity includes the PR coordinates, URI and native editor type, not its title', () => {
		const ref = makeRef();
		const input = store.add(new PullRequestReviewEditorInput(ref));
		const same = store.add(new PullRequestReviewEditorInput({ ...ref, title: 'Another title' }));
		const otherNumber = store.add(new PullRequestReviewEditorInput(makeRef(43)));
		const otherRepository = store.add(new PullRequestReviewEditorInput({ ...ref, repo: 'another' }));
		const otherHost = store.add(new PullRequestReviewEditorInput({ ...ref, uri: ref.uri.with({ authority: 'github.example.com' }) }));

		assert.deepStrictEqual({
			resource: input.resource,
			readonly: input.hasCapability(EditorInputCapabilities.Readonly),
			pane: Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).getEditorPane(input)?.typeId,
			matches: [same, otherNumber, otherRepository, otherHost, { resource: ref.uri }].map(other => input.matches(other)),
		}, {
			resource: ref.uri,
			readonly: true,
			pane: PullRequestReviewEditor.ID,
			matches: [true, false, false, false, false],
		});
	});

	test('command opens only the supplied PR in the native editor service', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEntitlementService, { sentiment: upcastPartial<IChatSentiment>({ hidden: false }) });
		instantiationService.stub(IEditorService, store.add(new TestEditorService()));
		const opened: { input: EditorInput; options: IEditorOptions | undefined; group: PreferredGroup | undefined }[] = [];
		instantiationService.stub(IEditorService, 'openEditor', async (input: EditorInput, options?: IEditorOptions, group?: PreferredGroup) => {
			store.add(input);
			opened.push({ input, options, group });
			return upcastPartial<IEditorPane>({ input });
		});
		const ref = makeRef(72);
		const command = CommandsRegistry.getCommand(OPEN_PULL_REQUEST_REVIEW_ACTION_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, ref));

		assert.deepStrictEqual({
			inputs: opened.map(({ input, options, group }) => ({
				native: input instanceof PullRequestReviewEditorInput,
				resource: input.resource,
				target: input instanceof PullRequestReviewEditorInput ? input.pullRequest : undefined,
				options,
				group,
				disposed: input.isDisposed(),
			})),
			inCommandPalette: MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem).some(item => item.command.id === OPEN_PULL_REQUEST_REVIEW_ACTION_ID),
			precondition: new OpenPullRequestReviewAction().desc.precondition?.serialize(),
		}, {
			inputs: [{ native: true, resource: ref.uri, target: ref, options: { pinned: true }, group: undefined, disposed: false }],
			inCommandPalette: false,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled)?.serialize(),
		});
	});

	test('command forwards editor options, modal groups, and actual editor groups without changing defaults or caller options', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEntitlementService, { sentiment: upcastPartial<IChatSentiment>({ hidden: false }) });
		instantiationService.stub(IEditorService, store.add(new TestEditorService()));
		const opened: { native: boolean; resource: URI | undefined; options: IEditorOptions | undefined; group: PreferredGroup | undefined }[] = [];
		instantiationService.stub(IEditorService, 'openEditor', async (input: EditorInput, options?: IEditorOptions, group?: PreferredGroup) => {
			store.add(input);
			opened.push({ native: input instanceof PullRequestReviewEditorInput, resource: input.resource, options, group });
			return upcastPartial<IEditorPane>({ input });
		});
		const ref = makeRef(72);
		const options: IEditorOptions = { pinned: false, preserveFocus: true };
		const nativeGroup = new TestEditorGroupView(17);
		const command = CommandsRegistry.getCommand(OPEN_PULL_REQUEST_REVIEW_ACTION_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, ref, options, MODAL_GROUP));
		await instantiationService.invokeFunction(accessor => command.handler(accessor, ref, undefined, MODAL_GROUP));
		await instantiationService.invokeFunction(accessor => command.handler(accessor, ref, { preserveFocus: true }));
		await instantiationService.invokeFunction(accessor => command.handler(accessor, ref, options, nativeGroup));

		assert.deepStrictEqual({ opened, options, groupPassedByIdentity: opened.at(-1)?.group === nativeGroup }, {
			opened: [
				{ native: true, resource: ref.uri, options: { pinned: false, preserveFocus: true }, group: MODAL_GROUP },
				{ native: true, resource: ref.uri, options: { pinned: true }, group: MODAL_GROUP },
				{ native: true, resource: ref.uri, options: { pinned: true, preserveFocus: true }, group: undefined },
				{ native: true, resource: ref.uri, options: { pinned: false, preserveFocus: true }, group: nativeGroup },
			],
			options: { pinned: false, preserveFocus: true },
			groupPassedByIdentity: true,
		});
	});

	test('invalid command targets and disabled AI fail explicitly without opening an editor', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEntitlementService, { sentiment: upcastPartial<IChatSentiment>({ hidden: true }) });
		const command = CommandsRegistry.getCommand(OPEN_PULL_REQUEST_REVIEW_ACTION_ID);
		assert.ok(command);
		for (const ref of [undefined, { ...makeRef(), number: 0 }, { ...makeRef(), number: 1.5 }, { ...makeRef(), uri: URI.parse('command:unexpected') }]) {
			await assert.rejects(instantiationService.invokeFunction(async accessor => command.handler(accessor, ref)), /reference.*required/);
		}
		await assert.rejects(instantiationService.invokeFunction(async accessor => command.handler(accessor, makeRef())), /AI features are disabled/);
	});

	test('failed or reused editor opens dispose their unused input', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatEntitlementService, { sentiment: upcastPartial<IChatSentiment>({ hidden: false }) });
		instantiationService.stub(IEditorService, store.add(new TestEditorService()));
		const attempted: EditorInput[] = [];
		const existing = store.add(new PullRequestReviewEditorInput(makeRef()));
		instantiationService.stub(IEditorService, 'openEditor', async (input: EditorInput) => {
			attempted.push(input);
			return upcastPartial<IEditorPane>({ input: existing });
		});
		const command = CommandsRegistry.getCommand(OPEN_PULL_REQUEST_REVIEW_ACTION_ID);
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, makeRef()));
		instantiationService.stub(IEditorService, 'openEditor', async (input: EditorInput) => {
			attempted.push(input);
			throw new Error('Open failed');
		});
		await assert.rejects(instantiationService.invokeFunction(async accessor => command.handler(accessor, makeRef())), /Open failed/);

		assert.deepStrictEqual({ disposed: attempted.map(input => input.isDisposed()), existingDisposed: existing.isDisposed() }, { disposed: [true, true], existingDisposed: false });
	});

	test('renders real data with safe markdown, accurate check conclusions and accessible content', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		data.details.nextPullRequest = {
			...makePullRequest(),
			body: 'A **real** description.\n\n[Unsafe](command:unexpected)\n\n![Remote](https://example.invalid/image.png)\n\n<script>alert(1)</script>',
			isDraft: true,
		};
		data.details.nextReviews = [{ id: 1, author: { login: 'reviewer', avatarUrl: '' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-09-02T00:00:00Z' }];
		data.checks.nextChecks = [makeCheck(GitHubCheckConclusion.Cancelled), { ...makeCheck(), id: 2, name: 'Tests', status: GitHubCheckStatus.Queued, conclusion: undefined }];
		data.threads.nextThreads = [{
			id: 'thread', path: 'src/review.ts', line: 12, isResolved: false,
			comments: [{
				id: 1, body: 'Please **handle disposal**.', author: { login: 'reviewer', avatarUrl: '' },
				createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
				path: 'src/review.ts', line: 12, threadId: 'thread', inReplyToId: undefined,
			}],
		}];
		const { editor, container, opened } = createEditor(service);
		const input = store.add(new PullRequestReviewEditorInput(makeRef()));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		const accessible = store.add(editor.getAccessibleProvider(AccessibleViewType.View));
		const help = store.add(editor.getAccessibleProvider(AccessibleViewType.Help));
		const open = container.querySelector<HTMLElement>('.action-label[aria-label="Open on GitHub"]');
		assert.ok(open);
		open.click();
		await timeout(0);

		assert.deepStrictEqual({
			title: container.querySelector('h1')?.textContent,
			tabTitle: input.getName(),
			state: container.querySelector('.pull-request-review-state')?.textContent,
			description: container.querySelector('.pull-request-review-markdown strong')?.textContent,
			checks: Array.from(container.querySelectorAll('[aria-label="Checks"] li'), node => node.textContent),
			review: container.querySelector('[aria-label="Reviews"] li')?.textContent,
			thread: container.querySelector('.pull-request-review-thread h3')?.textContent,
			feedback: container.querySelector('.pull-request-review-thread strong')?.textContent,
			unsafeElements: container.querySelectorAll('script, img[src^="https:"], a[data-href^="command:"]').length,
			accessibleContent: accessible.provideContent().includes('handle disposal'),
			accessibleId: accessible.id,
			verbosity: accessible.verbositySettingKey,
			help: help.provideContent().includes('cannot submit reviews'),
			providers: AccessibleViewRegistry.getImplementations().filter(implementation => implementation.name === 'pullRequestReview').map(implementation => implementation.type).sort(),
			opened,
		}, {
			title: 'Live pull request 42',
			tabTitle: 'Live pull request 42',
			state: 'Draft',
			description: 'real',
			checks: ['Build: Cancelled', 'Tests: Queued'],
			review: 'reviewer: Changes requested',
			thread: 'src/review.ts, line 12',
			feedback: 'handle disposal',
			unsafeElements: 0,
			accessibleContent: true,
			accessibleId: 'sessionReview',
			verbosity: 'accessibility.verbosity.sessionReview',
			help: true,
			providers: [AccessibleViewType.Help, AccessibleViewType.View].sort(),
			opened: [{ resource: input.resource, options: { openExternal: true, allowContributedOpeners: true } }],
		});
	});

	test('keeps long content bounded, scrolls by keyboard, and preserves modified editor shortcuts', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		data.details.nextPullRequest = { ...makePullRequest(), body: Array.from({ length: 100 }, (_, index) => `Paragraph ${index}`).join('\n\n') };
		const { editor, container } = createEditor(service);
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, CancellationToken.None);
		await timeout(0);
		const content = container.querySelector<HTMLElement>('.pull-request-review-content');
		assert.ok(content);
		editor.focus();
		const help = store.add(editor.getAccessibleProvider(AccessibleViewType.Help));
		const pageDown = new KeyboardEvent('keydown', { key: 'PageDown', keyCode: 34, bubbles: true, cancelable: true });
		content.dispatchEvent(pageDown);
		const scrolled = content.scrollTop > 0;
		const modifiedPageUp = new KeyboardEvent('keydown', { key: 'PageUp', keyCode: 33, ctrlKey: true, bubbles: true, cancelable: true });
		content.dispatchEvent(modifiedPageUp);
		content.blur();
		help.onClose();

		assert.deepStrictEqual({
			bounded: content.clientHeight > 0 && content.clientHeight <= 480 && content.scrollHeight > content.clientHeight,
			scrolled,
			pageDownHandled: pageDown.defaultPrevented,
			modifiedShortcutHandled: modifiedPageUp.defaultPrevented,
			focusRestored: dom.getActiveElement() === content,
		}, { bounded: true, scrolled: true, pageDownHandled: true, modifiedShortcutHandled: false, focusRestored: true });
	});

	test('shows loading and errors, then recovers through the native Retry action', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		const gate = data.details.gate = new DeferredPromise<void>();
		data.details.error = new Error('Metadata offline');
		data.threads.error = new Error('Feedback offline');
		const { editor, container } = createEditor(service);
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, CancellationToken.None);
		const loading = container.querySelector('[aria-label="Description"]')?.getAttribute('aria-busy');
		await gate.complete();
		await timeout(0);
		const errors = Array.from(container.querySelectorAll('.pull-request-review-status.error'), node => node.textContent);
		data.details.error = undefined;
		data.threads.error = undefined;
		const retry = container.querySelector<HTMLElement>('.action-label[aria-label="Retry"]');
		assert.ok(retry);
		retry.click();
		await timeout(0);

		assert.deepStrictEqual({
			loading,
			errors,
			remainingErrors: container.querySelectorAll('.pull-request-review-status.error').length,
			title: container.querySelector('h1')?.textContent,
			refreshCounts: [data.details.refreshCount, data.threads.refreshCount],
		}, {
			loading: 'true',
			errors: ['Metadata offline Retry or open on GitHub.', 'Metadata offline Retry or open on GitHub.', 'Feedback offline Retry or open on GitHub.'],
			remainingErrors: 0,
			title: 'Live pull request 42',
			refreshCounts: [2, 2],
		});
	});

	test('does not claim empty checks succeeded and makes missing metadata explicitly unavailable', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		data.checks.nextChecks = [];
		const model = store.add(new PullRequestReviewModel(makeRef(), service, new NullLogService()));
		await model.refresh();
		await timeout(0);
		const checks = model.checks.get();
		data.details.nextPullRequest = undefined;
		await model.refresh();
		const details = model.details.get();

		assert.deepStrictEqual({
			checks,
			details,
			released: service.released,
		}, {
			checks: { loading: false, error: undefined, value: undefined },
			details: { loading: false, error: undefined, value: undefined },
			released: ['microsoft/vscode/42/head-1'],
		});
	});

	test('replaces only the head-specific CI reference and never starts polling', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		const secondChecks = new TestCIModel();
		secondChecks.nextChecks = [makeCheck(GitHubCheckConclusion.Failure)];
		service.checks.set('42/head-2', secondChecks);
		const model = store.add(new PullRequestReviewModel(makeRef(), service, new NullLogService()));
		await model.refresh();
		await timeout(0);
		data.details.pullRequest.set(makePullRequest(42, 'head-2'), undefined);
		await timeout(0);
		data.details.pullRequest.set({ ...makePullRequest(42, 'head-2'), title: 'Title update only' }, undefined);
		const checkNames = model.checks.get().value?.map(check => check.conclusion);
		model.dispose();
		data.details.pullRequest.set(makePullRequest(42, 'head-3'), undefined);

		assert.deepStrictEqual({
			acquired: service.acquired,
			released: service.released.slice().sort(),
			checkNames,
		}, {
			acquired: ['microsoft/vscode/42/details', 'microsoft/vscode/42/threads', 'microsoft/vscode/42/head-1', 'microsoft/vscode/42/head-2'],
			released: ['microsoft/vscode/42/details', 'microsoft/vscode/42/head-1', 'microsoft/vscode/42/head-2', 'microsoft/vscode/42/threads'],
			checkNames: [GitHubCheckConclusion.Failure],
		});
	});

	test('changing input immediately releases references and ignores the old request completion', async () => {
		const service = new TestGitHubService();
		const first = service.add(makeRef());
		service.add(makeRef(43));
		const gate = first.details.gate = new DeferredPromise<void>();
		first.threads.gate = gate;
		const { editor, container } = createEditor(service);
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, CancellationToken.None);
		const opening = editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef(43))), undefined, {}, CancellationToken.None);
		const releasedImmediately = service.released.slice().sort();
		await opening;
		await timeout(0);
		await gate.complete();
		await timeout(0);
		const title = container.querySelector('h1')?.textContent;
		editor.clearInput();
		const acquiredBefore = service.acquired.slice();
		first.details.pullRequest.set(makePullRequest(42, 'unobserved'), undefined);

		assert.deepStrictEqual({
			releasedImmediately,
			title,
			oldCheckReference: service.acquired.includes('microsoft/vscode/42/head-1'),
			detached: service.acquired.length === acquiredBefore.length,
			allReleased: service.released.slice().sort(),
			remainingContent: container.querySelectorAll('.pull-request-review-content').length,
		}, {
			releasedImmediately: ['microsoft/vscode/42/details', 'microsoft/vscode/42/threads'],
			title: 'Live pull request 43',
			oldCheckReference: false,
			detached: true,
			allReleased: ['microsoft/vscode/42/details', 'microsoft/vscode/42/threads', 'microsoft/vscode/43/details', 'microsoft/vscode/43/head-1', 'microsoft/vscode/43/threads'],
			remainingContent: 0,
		});
	});

	test('cancelled inputs acquire no model references', async () => {
		const service = new TestGitHubService();
		const { editor } = createEditor(service);
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, cancellation.token);
		assert.deepStrictEqual(service.acquired, []);
	});

	test('finishing the native editor open does not dispose the displayed PR or its actions', async () => {
		const service = new TestGitHubService();
		const data = service.add(makeRef());
		const { editor, container } = createEditor(service);
		const cancellation = store.add(new CancellationTokenSource());
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, cancellation.token);
		cancellation.cancel();
		await timeout(0);
		data.details.pullRequest.set({ ...makePullRequest(), title: 'Updated while reviewing' }, undefined);
		assert.deepStrictEqual({
			actions: [...container.querySelectorAll('.pull-request-review-toolbar .action-label')].map(element => element.textContent),
			title: container.querySelector('h1')?.textContent,
			released: service.released,
		}, { actions: ['Open on GitHub', 'Retry'], title: 'Updated while reviewing', released: [] });
	});

	test('disposing the input or pane releases its model references', async () => {
		const service = new TestGitHubService();
		service.add(makeRef());
		const { editor } = createEditor(service);
		const input = store.add(new PullRequestReviewEditorInput(makeRef()));
		await editor.setInput(input, undefined, {}, CancellationToken.None);
		await timeout(0);
		input.dispose();
		const releasedOnInputDisposal = service.released.length;
		await editor.setInput(store.add(new PullRequestReviewEditorInput(makeRef())), undefined, {}, CancellationToken.None);
		await timeout(0);
		editor.dispose();

		assert.deepStrictEqual({
			releasedOnInputDisposal,
			acquired: service.acquired.length,
			released: service.released.length,
		}, { releasedOnInputDisposal: 3, acquired: 6, released: 6 });
	});
});
