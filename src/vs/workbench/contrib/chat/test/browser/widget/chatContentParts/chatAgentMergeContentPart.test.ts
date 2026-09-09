/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAgentMergePromptSummary } from '../../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { ChatAgentMergeContentPart, describeAgentMergeFileLabels, getAgentMergeSummaryLabel } from '../../../../browser/widget/chatContentParts/chatAgentMergeContentPart.js';

function summary(overrides: Partial<IAgentMergePromptSummary> = {}): IAgentMergePromptSummary {
	return {
		actions: [],
		pullRequestUrl: '',
		title: '',
		headRef: '',
		headSha: '',
		baseRef: 'main',
		reviewThreads: [],
		reviewSummaries: [],
		newComments: [],
		failedChecks: [],
		behind: false,
		conflicting: false,
		agentMessage: '',
		...overrides,
	};
}

function createPart(
	data: IAgentMergePromptSummary,
	options: {
		readonly hoverService?: IHoverService;
		readonly markdownRenderer?: IMarkdownRenderer;
		readonly timestamp?: number;
	} = {},
): ChatAgentMergeContentPart {
	return new ChatAgentMergeContentPart(
		data,
		URI.parse('test://session'),
		options.markdownRenderer ?? upcastPartial<IMarkdownRenderer>({}),
		options.timestamp,
		upcastPartial<IOpenerService>({}),
		options.hoverService ?? upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) }),
		upcastPartial<ICommandService>({}),
	);
}

suite('ChatAgentMergeContentPart file labels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('names a unique file without a disambiguating path', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts', line: 68 },
			{ path: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
			{},
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'chatWidget.ts:68', title: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatEditor.ts', title: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
			undefined,
		]);
	});

	test('adds the shortest distinguishing prefix to same-named files', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts', line: 412 },
			{ path: 'src/vs/sessions/contrib/chat/browser/chatWidget.ts', line: 88 },
			{ path: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts', line: 24 },
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'chatWidget.ts:412', description: '…/workbench/…', title: 'src/vs/workbench/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatWidget.ts:88', description: '…/sessions/…', title: 'src/vs/sessions/contrib/chat/browser/chatWidget.ts' },
			{ name: 'chatEditor.ts:24', title: 'src/vs/workbench/contrib/chat/browser/chatEditor.ts' },
		]);
	});

	test('leaves same-named files in one directory undisambiguated', () => {
		const labels = describeAgentMergeFileLabels([
			{ path: 'src/a/index.ts', line: 1 },
			{ path: 'src/a/index.ts', line: 9 },
		]);

		assert.deepStrictEqual(labels, [
			{ name: 'index.ts:1', title: 'src/a/index.ts' },
			{ name: 'index.ts:9', title: 'src/a/index.ts' },
		]);
	});

	test('summarizes encountered events in one status sentence', () => {
		assert.deepStrictEqual([
			getAgentMergeSummaryLabel(summary()),
			getAgentMergeSummaryLabel(summary({ behind: true })),
			getAgentMergeSummaryLabel(summary({ conflicting: true })),
			getAgentMergeSummaryLabel(summary({
				reviewSummaries: [
					{ author: 'octocat', body: 'Please fix this.' },
					{ author: 'hubot', body: 'Please add a test.' },
				],
				failedChecks: ['Compile', 'Unit Tests'],
				behind: true,
				conflicting: true,
			})),
		], [
			'No Pending Feedback, Agent Merge',
			'Behind Base Branch, Agent Merge',
			'Merge Conflicts, Agent Merge',
			'2 Review Comments, 2 Failing Checks, Merge Conflicts, and Behind Base Branch, Agent Merge',
		]);
	});

	test('keeps the Agent Message toggle name stable while reporting its state', () => {
		const part = store.add(createPart(summary({ agentMessage: 'Merge agent details.' })));
		const button = part.domNode.querySelector<HTMLElement>('.chat-agent-merge-message-toggle');
		assert.ok(button);

		const getAccessibleState = () => ({
			label: button.getAttribute('aria-label'),
			pressed: button.getAttribute('aria-pressed'),
		});
		const initial = getAccessibleState();
		button.click();
		const showingMessage = getAccessibleState();
		button.click();
		const showingDetails = getAccessibleState();

		assert.deepStrictEqual([initial, showingMessage, showingDetails], [
			{ label: 'Agent Message', pressed: 'false' },
			{ label: 'Agent Message', pressed: 'true' },
			{ label: 'Agent Message', pressed: 'false' },
		]);
	});

	test('reveals secondary actions for touch input while suppressing mouse focus', () => {
		const part = store.add(createPart(summary()));
		const button = part.domNode.querySelector<HTMLElement>('.chat-agent-merge-header-disclosure');
		assert.ok(button);
		dom.getWindow(button).document.body.append(part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));

		const pointerDown = (pointerType: string) => {
			const event = new PointerEvent(dom.EventType.POINTER_DOWN, { bubbles: true, cancelable: true, pointerType });
			button.dispatchEvent(event);
			return event.defaultPrevented;
		};

		button.focus();
		const touchPrevented = pointerDown('touch');
		const touchInput = part.domNode.classList.contains('direct-pointer-input');
		button.focus();
		const mousePrevented = pointerDown('mouse');
		const mouseInput = part.domNode.classList.contains('direct-pointer-input');
		const mouseRetainedFocus = dom.getWindow(button).document.activeElement === button;

		assert.deepStrictEqual({
			touchPrevented,
			touchInput,
			mousePrevented,
			mouseInput,
			mouseRetainedFocus,
		}, {
			touchPrevented: false,
			touchInput: true,
			mousePrevented: true,
			mouseInput: false,
			mouseRetainedFocus: false,
		});
	});

	test('attaches the status hover to the interactive disclosure', () => {
		let hoverTarget: HTMLElement | undefined;
		const part = store.add(createPart(summary(), {
			hoverService: upcastPartial<IHoverService>({
				setupDelayedHover: target => {
					hoverTarget = target;
					return toDisposable(() => { });
				},
			}),
		}));

		assert.strictEqual(hoverTarget, part.domNode.querySelector('.chat-agent-merge-header-disclosure'));
	});

	test('renders the request timestamp and participant below the card', () => {
		const timestamp = new Date().setHours(15, 33, 0, 0);
		const part = store.add(createPart(summary(), { timestamp }));
		const metadata = part.domNode.querySelector('.chat-agent-merge-metadata');
		const time = metadata?.querySelector('time');

		assert.deepStrictEqual({
			cardParent: part.domNode.querySelector('.chat-agent-merge-card')?.parentElement,
			metadataParent: metadata?.parentElement,
			metadataText: metadata?.textContent,
			dateTime: time?.dateTime,
			tabIndex: time?.tabIndex,
		}, {
			cardParent: part.domNode,
			metadataParent: part.domNode,
			metadataText: '3:33 PM\u2022Agent Merge',
			dateTime: new Date(timestamp).toISOString(),
			tabIndex: 0,
		});
	});

	test('shows section headings only when comments and checks are both present', () => {
		const markdownRenderer = upcastPartial<IMarkdownRenderer>({
			render: () => ({ element: dom.$('div'), dispose: () => { } }),
		});
		const reviewSummaries = [{ author: 'octocat', body: 'Please fix this.' }];
		const commentsOnly = store.add(createPart(summary({ reviewSummaries }), { markdownRenderer }));
		const checksOnly = store.add(createPart(summary({ failedChecks: ['Compile'] }), { markdownRenderer }));
		const mixed = store.add(createPart(summary({ reviewSummaries, failedChecks: ['Compile'] }), { markdownRenderer }));
		const sectionTitles = (part: ChatAgentMergeContentPart) =>
			Array.from(part.domNode.querySelectorAll('.chat-agent-merge-section-title'), element => element.textContent);

		assert.deepStrictEqual([
			sectionTitles(commentsOnly),
			sectionTitles(checksOnly),
			sectionTitles(mixed),
		], [
			[],
			[],
			['Feedback', 'Checks'],
		]);
	});
});
