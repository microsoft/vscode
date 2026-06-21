/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../../common/constants.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { ChatScrollbarPromptMarkerController, IChatScrollbarPromptMarkerHost } from '../../../browser/widget/chatScrollbarPromptMarkerController.js';

/**
 * A self-contained fake host that mirrors the subset of ChatListWidget methods
 * used by ChatScrollbarPromptMarkerController. This allows the controller to be
 * tested in isolation without instantiating the full workbench.
 */
class FakeHost extends mock<IChatScrollbarPromptMarkerHost>() implements IChatScrollbarPromptMarkerHost {
	override readonly renderHeight: number = 0;
	override readonly scrollHeight: number = 0;
	private readonly _items: (IChatRequestViewModel | IChatResponseViewModel)[] = [];
	private readonly _heights = new Map<string, number>();
	private readonly _tops = new Map<string, number>();
	private _focus: (IChatRequestViewModel | IChatResponseViewModel)[] = [];
	private _layoutInfo: { parent: HTMLElement; insertBefore: HTMLElement } | undefined;

	constructor(opts: {
		renderHeight: number;
		scrollHeight: number;
		items?: (IChatRequestViewModel | IChatResponseViewModel)[];
		heights?: Map<string, number>;
		tops?: Map<string, number>;
		focus?: (IChatRequestViewModel | IChatResponseViewModel)[];
		layoutInfo?: { parent: HTMLElement; insertBefore: HTMLElement };
	}) {
		super();
		this.renderHeight = opts.renderHeight;
		this.scrollHeight = opts.scrollHeight;
		this._items = opts.items ?? [];
		this._heights = opts.heights ?? new Map();
		this._tops = opts.tops ?? new Map();
		this._focus = opts.focus ?? [];
		this._layoutInfo = opts.layoutInfo;
	}

	override getOverviewRulerLayoutInfo() { return this._layoutInfo; }
	override getItems() { return this._items; }
	override hasElement(element: IChatRequestViewModel | IChatResponseViewModel) { return this._items.includes(element); }
	override getElementTop(element: IChatRequestViewModel | IChatResponseViewModel) { return this._tops.get(element.id) ?? 0; }
	override getElementHeight(element: IChatRequestViewModel | IChatResponseViewModel) { return this._heights.get(element.id) ?? 0; }
	override getFocus() { return this._focus; }
	override reveal() { /* no-op */ }
	override focusItem() { /* no-op */ }
}

/**
 * Creates a minimal request view model for controller tests.
 */
function makeRequest(id: string): IChatRequestViewModel {
	return {
		id,
		sessionResource: undefined as never,
		dataId: id,
		username: 'User',
		message: undefined as never,
		messageText: id,
		attempt: 0,
		variables: [],
		currentRenderedHeight: undefined,
		isComplete: true,
		isCompleteAddedRequest: false,
		agentOrSlashCommandDetected: false,
		shouldBeRemovedOnSend: undefined as never,
		shouldBeBlocked: undefined as never,
		timestamp: 0,
		editedFileEvents: undefined,
		isSystemInitiated: undefined,
		slashCommand: undefined,
	} as IChatRequestViewModel;
}

/**
 * Creates a minimal response view model for controller tests.
 */
function makeResponse(requestId: string, parts: unknown[] = []): IChatResponseViewModel {
	return {
		id: `${requestId}-response`,
		sessionResource: undefined as never,
		model: { entireResponse: { value: parts } } as never,
		dataId: `${requestId}-response`,
		session: undefined as never,
		username: 'Assistant',
		agentOrSlashCommandDetected: false,
		response: undefined as never,
		usedContext: undefined,
		contentReferences: [],
		codeCitations: [],
		progressMessages: [],
		isComplete: true,
		isCanceled: false,
		isStale: false,
		vote: undefined,
		requestId,
		replyFollowups: undefined,
		errorDetails: undefined,
		result: undefined,
		contentUpdateTimings: undefined,
		confirmationAdjustedTimestamp: undefined as never,
		usageObs: undefined as never,
		completionTokenCountObs: undefined as never,
		isCompleteAddedRequest: false,
		currentRenderedHeight: undefined,
		setVote: () => { },
		setEditApplied: () => { },
		vulnerabilitiesListExpanded: false,
		shouldBeRemovedOnSend: undefined as never,
		shouldBeBlocked: undefined as never,
	} as IChatResponseViewModel;
}

/**
 * Creates a fake file service that accepts writes without error.
 */
function makeFileService(): IFileService {
	const fake: IFileService = new (mock<IFileService>() as unknown as { new(): IFileService })();
	fake.writeFile = async () => ({}) as never;
	return fake;
}

/**
 * Creates a configuration service pre-configured with the given click behavior.
 */
function makeConfigService(behavior: ChatScrollbarPromptMarkerClickBehavior): TestConfigurationService {
	return new TestConfigurationService({
		'chat.scrollbarPromptMarkers.clickBehavior': behavior,
	});
}

/**
 * Creates a layout info object with a parent element and an insertBefore element
 * that has a fixed width for scrollbar width calculation.
 */
function makeLayoutInfo(width = 14): { parent: HTMLElement; insertBefore: HTMLElement } {
	const parent = document.createElement('div');
	const insertBefore = document.createElement('div');
	parent.appendChild(insertBefore);
	// Mock getBoundingClientRect to return the desired width
	insertBefore.getBoundingClientRect = () => ({
		width, height: 0, x: 0, y: 0,
		left: 0, top: 0, right: width, bottom: 0,
		toJSON: () => ({}),
	});
	return { parent, insertBefore };
}

suite('ChatScrollbarPromptMarkerController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// Helper to create a controller with the given host and behavior
	function createController(host: IChatScrollbarPromptMarkerHost, behavior: ChatScrollbarPromptMarkerClickBehavior = ChatScrollbarPromptMarkerClickBehavior.Reveal): ChatScrollbarPromptMarkerController {
		return disposables.add(new ChatScrollbarPromptMarkerController(
			host,
			makeConfigService(behavior),
			makeFileService(),
			new NullLogService(),
		));
	}

	suite('layout', () => {
		test('places the container inside the overview ruler parent and sizes it to renderHeight x scrollbarWidth', () => {
			const layoutInfo = makeLayoutInfo(14);
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 400, layoutInfo });
			const controller = createController(host);

			controller.layout();

			assert.strictEqual(controller['container'].parentElement, layoutInfo.parent);
			assert.strictEqual(controller['container'].style.height, '200px');
			assert.strictEqual(controller['container'].style.width, '14px');
		});

		test('re-attaches parent listeners when the overview ruler parent changes', () => {
			const layoutInfo1 = makeLayoutInfo(14);
			const layoutInfo2 = makeLayoutInfo(14);
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 400, layoutInfo: layoutInfo1 });
			const controller = createController(host);

			controller.layout();
			const listenersAfterFirst = controller['parentPointerDownListener'].value ? 1 : 0;

			// Change to a new parent
			(host as unknown as { _layoutInfo: unknown })._layoutInfo = layoutInfo2;
			controller.layout();
			const listenersAfterSecond = controller['parentPointerDownListener'].value ? 1 : 0;

			assert.strictEqual(listenersAfterFirst, 1);
			assert.strictEqual(listenersAfterSecond, 1);
		});

		test('does not re-attach listeners when the parent stays the same', () => {
			const layoutInfo = makeLayoutInfo(14);
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 400, layoutInfo });
			const controller = createController(host);

			controller.layout();
			const firstListener = controller['parentPointerDownListener'].value;

			controller.layout();
			const secondListener = controller['parentPointerDownListener'].value;

			// Same listener object — not re-created
			assert.strictEqual(firstListener, secondListener);
		});

		test('is a no-op when getOverviewRulerLayoutInfo returns undefined', () => {
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 400, layoutInfo: undefined });
			const controller = createController(host);

			controller.layout();

			assert.strictEqual(controller['container'].parentElement, null);
		});
	});

	suite('renderMarkers', () => {
		test('produces one marker element per descriptor with correct data attributes and styles', () => {
			const req = makeRequest('r1');
			const res = makeResponse('r1', [{ kind: 'externalEdit' }]);
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100], ['r1-response', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 100]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req, res], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];
			const markers = container.querySelectorAll('.chat-scrollbar-prompt-marker');

			assert.strictEqual(markers.length, 2);

			const promptMarker = markers[0] as HTMLElement;
			assert.strictEqual(promptMarker.dataset.markerId, 'r1');
			assert.strictEqual(promptMarker.dataset.markerType, 'prompt');
			assert.strictEqual(promptMarker.style.left, 'auto');
			assert.strictEqual(promptMarker.style.right, '0px');
			assert.strictEqual(promptMarker.style.width, '50%');
			assert.strictEqual(promptMarker.style.zIndex, '60');

			const fileChangeMarker = markers[1] as HTMLElement;
			assert.strictEqual(fileChangeMarker.dataset.markerId, 'r1-response');
			assert.strictEqual(fileChangeMarker.dataset.markerType, 'fileChange');
			assert.strictEqual(fileChangeMarker.style.left, '0px');
			assert.strictEqual(fileChangeMarker.style.right, '0px');
			assert.strictEqual(fileChangeMarker.style.width, 'auto');
			assert.strictEqual(fileChangeMarker.style.zIndex, '80');
		});

		test('left-lane markers get left:0, width:50%', () => {
			const req = makeRequest('r1');
			const res = makeResponse('r1', [{ kind: 'questionCarousel', isUsed: false }]);
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100], ['r1-response', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 100]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req, res], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const markers = controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker');
			const askMarker = Array.from(markers).find(m => (m as HTMLElement).dataset.markerType === 'askQuestion') as HTMLElement;

			assert.strictEqual(askMarker.style.left, '0px');
			assert.strictEqual(askMarker.style.right, 'auto');
			assert.strictEqual(askMarker.style.width, '50%');
		});

		test('active class toggles on the marker whose id matches the focused item', () => {
			const req = makeRequest('r1');
			const res = makeResponse('r1', [{ kind: 'externalEdit' }]);
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100], ['r1-response', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 100]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req, res], heights, tops, layoutInfo,
				focus: [req],
			});
			const controller = createController(host);

			controller.layout();
			const markers = controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker');
			const promptMarker = Array.from(markers).find(m => (m as HTMLElement).dataset.markerId === 'r1') as HTMLElement;

			assert.strictEqual(promptMarker.classList.contains('active'), true);
		});

		test('stale markers are removed from the DOM when descriptors shrink', () => {
			const req1 = makeRequest('r1');
			const res1 = makeResponse('r1', [{ kind: 'externalEdit' }]);
			const req2 = makeRequest('r2');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100], ['r1-response', 100], ['r2', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 100], ['r2', 200]]);
			const host = new FakeHost({
				renderHeight: 300, scrollHeight: 300,
				items: [req1, res1, req2], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 3);

			// Remove req2 and its response
			(host as unknown as { _items: unknown[] })._items = [req1, res1];
			controller.refresh();
			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 2);
		});

		test('marker DOM nodes are reused across renders when the descriptor id persists', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const markerBefore = controller['container'].querySelector('.chat-scrollbar-prompt-marker');

			controller.refresh();
			const markerAfter = controller['container'].querySelector('.chat-scrollbar-prompt-marker');

			assert.strictEqual(markerBefore, markerAfter);
		});

		test('repeated refresh calls do not accumulate marker DOM nodes', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			for (let i = 0; i < 10; i++) {
				controller.refresh();
			}

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 1);
		});

		test('minHeight enforcement: a marker whose scaled height is below minHeight is centered around its scaled top', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			// Very small element height relative to scroll height → scaled height < 4 (minHeight)
			const heights = new Map([['r1', 1]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 1000,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const marker = controller['container'].querySelector('.chat-scrollbar-prompt-marker') as HTMLElement;

			// scaledHeight = 1 * (200/1000) = 0.2, which is < 4 (minHeight)
			// height = max(4, round(0.2)) = 4, clamped to min(4, 200) = 4
			// top = scaledTop + scaledHeight/2 - height/2 = 0 + 0.1 - 2 = -1.9 → clamped to 0
			assert.strictEqual(marker.style.height, '4px');
			assert.strictEqual(marker.style.top, '0px');
		});

		test('overlap resolution: when two markers would overlap, the lower one is pushed down', () => {
			const req1 = makeRequest('r1');
			const req2 = makeRequest('r2');
			const layoutInfo = makeLayoutInfo(14);
			// Both at top=0, height=100, scaled to 100px each in a 200px ruler → they overlap
			const heights = new Map([['r1', 100], ['r2', 100]]);
			const tops = new Map([['r1', 0], ['r2', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req1, req2], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const markers = Array.from(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker')) as HTMLElement[];
			const tops2 = markers.map(m => parseInt(m.style.top, 10));

			// The second marker should be pushed below the first (top >= first.top + first.height + 1)
			assert.ok(tops2[1] >= tops2[0] + 4 + 1, `second marker top ${tops2[1]} should be >= ${tops2[0] + 4 + 1}`);
		});

		test('overlap resolution clamps to rulerHeight - height', () => {
			const req1 = makeRequest('r1');
			const req2 = makeRequest('r2');
			const layoutInfo = makeLayoutInfo(14);
			// Both at top=0, height=100 in a 50px ruler → heavy overlap, must clamp
			const heights = new Map([['r1', 100], ['r2', 100]]);
			const tops = new Map([['r1', 0], ['r2', 0]]);
			const host = new FakeHost({
				renderHeight: 50, scrollHeight: 200,
				items: [req1, req2], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const markers = Array.from(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker')) as HTMLElement[];

			for (const marker of markers) {
				const top = parseInt(marker.style.top, 10);
				const height = parseInt(marker.style.height, 10);
				assert.ok(top + height <= 50, `marker bottom ${top + height} should not exceed rulerHeight 50`);
			}
		});
	});

	suite('setVisible', () => {
		test('setVisible(false) hides the container; setVisible(true) shows it when renderHeight > 0', () => {
			const layoutInfo = makeLayoutInfo(14);
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 400, layoutInfo });
			const controller = createController(host);

			controller.layout();
			assert.notStrictEqual(controller['container'].style.display, 'none');

			controller.setVisible(false);
			assert.strictEqual(controller['container'].style.display, 'none');

			controller.setVisible(true);
			assert.notStrictEqual(controller['container'].style.display, 'none');
		});
	});

	suite('getTargetAtPoint', () => {
		test('returns the correct target for a click inside a marker Y range, even in the opposite lane', () => {
			const req = makeRequest('r1');
			const res = makeResponse('r1', [{ kind: 'externalEdit' }]);
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100], ['r1-response', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 100]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req, res], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];

			// Mock container getBoundingClientRect for hit-testing
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			// Mock marker rects — the prompt marker is at top=0, height=4
			const markers = container.querySelectorAll('.chat-scrollbar-prompt-marker');
			(markers[0] as HTMLElement).getBoundingClientRect = () => ({
				width: 7, height: 4, x: 7, y: 0,
				left: 7, top: 0, right: 14, bottom: 4,
				toJSON: () => ({}),
			});

			// Click at x=0 (left side, opposite lane), y=2 (within marker Y range)
			const target = controller['getTargetAtPoint'](0, 2);
			assert.strictEqual(target, req);
		});

		test('returns undefined for a click outside the container bounds', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			// Click far outside
			const target = controller['getTargetAtPoint'](1000, 1000);
			assert.strictEqual(target, undefined);
		});

		test('returns undefined when visible is false', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			controller.setVisible(false);

			const container = controller['container'];
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			const target = controller['getTargetAtPoint'](0, 2);
			assert.strictEqual(target, undefined);
		});

		test('overlapping markers at the same Y: right-lane wins over left-lane wins over full-lane', () => {
			const req = makeRequest('r1'); // prompt → right lane
			const res = makeResponse('r1', [{ kind: 'questionCarousel', isUsed: false }]); // askQuestion → left lane
			const layoutInfo = makeLayoutInfo(14);
			// Both at the same position so they overlap
			const heights = new Map([['r1', 100], ['r1-response', 100]]);
			const tops = new Map([['r1', 0], ['r1-response', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req, res], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			// Mock both markers to overlap at Y=0..4
			const markers = container.querySelectorAll('.chat-scrollbar-prompt-marker');
			for (const marker of markers) {
				(marker as HTMLElement).getBoundingClientRect = () => ({
					width: 7, height: 4, x: 0, y: 0,
					left: 0, top: 0, right: 7, bottom: 4,
					toJSON: () => ({}),
				});
			}

			// Both markers overlap at Y=2; right-lane (prompt) should win
			const target = controller['getTargetAtPoint'](7, 2);
			assert.strictEqual(target, req);
		});
	});

	suite('edge cases', () => {
		test('scrollHeight <= 0 clears all markers and target maps', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 0,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 0);
			assert.strictEqual(controller['markerById'].size, 0);
			assert.strictEqual(controller['targetById'].size, 0);
		});

		test('renderHeight <= 0 clears all markers and hides the container', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 0, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 0);
			assert.strictEqual(controller['container'].style.display, 'none');
		});

		test('getOverviewRulerLayoutInfo returns undefined → renderMarkers is a no-op', () => {
			const req = makeRequest('r1');
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], layoutInfo: undefined,
			});
			const controller = createController(host);

			controller.refresh();

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 0);
		});

		test('no descriptors (empty items) → no marker elements', () => {
			const layoutInfo = makeLayoutInfo(14);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [], layoutInfo,
			});
			const controller = createController(host);

			controller.layout();

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 0);
		});
	});

	suite('revealItem', () => {
		test('with Reveal calls reveal only and never focusItem', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const calls: string[] = [];
			const host = new class extends FakeHost {
				constructor() {
					super({ renderHeight: 200, scrollHeight: 200, items: [req], heights, tops, layoutInfo });
				}
				override reveal() { calls.push('reveal'); }
				override focusItem() { calls.push('focusItem'); }
			}();
			const controller = createController(host, ChatScrollbarPromptMarkerClickBehavior.Reveal);

			controller['revealItem'](req);

			assert.deepStrictEqual(calls, ['reveal']);
		});

		test('with RevealAndFocus calls reveal immediately and retries focusItem across animation frames', async () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const calls: string[] = [];
			let hasElementCountdown = 3;
			const host = new class extends FakeHost {
				constructor() {
					super({ renderHeight: 200, scrollHeight: 200, items: [req], heights, tops, layoutInfo });
				}
				override reveal() { calls.push('reveal'); }
				override focusItem() { calls.push('focusItem'); }
				override hasElement() {
					if (hasElementCountdown > 0) {
						hasElementCountdown--;
						return false;
					}
					return true;
				}
			}();
			const controller = createController(host, ChatScrollbarPromptMarkerClickBehavior.RevealAndFocus);

			controller['revealItem'](req);

			// reveal is called immediately; focusItem is deferred to animation frames
			assert.deepStrictEqual(calls, ['reveal']);

			// Wait for animation frames to process
			await new Promise(resolve => setTimeout(resolve, 200));

			// focusItem should have been called once after hasElement returned true
			assert.ok(calls.includes('focusItem'), `expected focusItem to be called, got: ${JSON.stringify(calls)}`);
			assert.strictEqual(calls.filter(c => c === 'focusItem').length, 1);
		});
	});

	suite('pointer/click event handling', () => {
		test('pointerdown on a marker sets markerActivated, calls preventDefault/stopPropagation, and reveals', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const calls: string[] = [];
			const host = new class extends FakeHost {
				constructor() {
					super({ renderHeight: 200, scrollHeight: 200, items: [req], heights, tops, layoutInfo });
				}
				override reveal() { calls.push('reveal'); }
			}();
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			// Mock marker rect so hit-testing finds it
			const marker = container.querySelector('.chat-scrollbar-prompt-marker') as HTMLElement;
			marker.getBoundingClientRect = () => ({
				width: 7, height: 4, x: 7, y: 0,
				left: 7, top: 0, right: 14, bottom: 4,
				toJSON: () => ({}),
			});

			let prevented = false;
			let stopped = false;
			const event = {
				clientX: 7, clientY: 2,
				preventDefault: () => { prevented = true; },
				stopPropagation: () => { stopped = true; },
			} as unknown as PointerEvent;

			controller['onOverviewRulerPointerDown'](event);

			assert.strictEqual(controller['markerActivated'], true);
			assert.strictEqual(prevented, true);
			assert.strictEqual(stopped, true);
			assert.deepStrictEqual(calls, ['reveal']);
		});

		test('pointerdown outside any marker does not activate or reveal', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const calls: string[] = [];
			const host = new class extends FakeHost {
				constructor() {
					super({ renderHeight: 200, scrollHeight: 200, items: [req], heights, tops, layoutInfo });
				}
				override reveal() { calls.push('reveal'); }
			}();
			const controller = createController(host);

			controller.layout();
			const container = controller['container'];
			container.getBoundingClientRect = () => ({
				width: 14, height: 200, x: 0, y: 0,
				left: 0, top: 0, right: 14, bottom: 200,
				toJSON: () => ({}),
			});

			let prevented = false;
			const event = {
				clientX: 7, clientY: 199, // outside marker Y range
				preventDefault: () => { prevented = true; },
				stopPropagation: () => { },
			} as unknown as PointerEvent;

			controller['onOverviewRulerPointerDown'](event);

			assert.strictEqual(controller['markerActivated'], false);
			assert.strictEqual(prevented, false);
			assert.deepStrictEqual(calls, []);
		});

		test('click and mouseup are suppressed when markerActivated is true', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			controller['markerActivated'] = true;

			// mouseup happens before click in the event sequence
			let mouseupPrevented = false;
			let mouseupStopped = false;
			const mouseupEvent = {
				preventDefault: () => { mouseupPrevented = true; },
				stopPropagation: () => { mouseupStopped = true; },
			} as unknown as MouseEvent;
			controller['onOverviewRulerMouseUp'](mouseupEvent);

			let clickPrevented = false;
			let clickStopped = false;
			const clickEvent = {
				preventDefault: () => { clickPrevented = true; },
				stopPropagation: () => { clickStopped = true; },
			} as unknown as MouseEvent;
			controller['onOverviewRulerClick'](clickEvent);

			assert.strictEqual(mouseupPrevented, true);
			assert.strictEqual(mouseupStopped, true);
			assert.strictEqual(clickPrevented, true);
			assert.strictEqual(clickStopped, true);
			// Click resets markerActivated
			assert.strictEqual(controller['markerActivated'], false);
		});

		test('click and mouseup are not suppressed when markerActivated is false', () => {
			const controller = createController(new FakeHost({ renderHeight: 200, scrollHeight: 200, layoutInfo: makeLayoutInfo(14) }));

			let prevented = false;
			const event = {
				preventDefault: () => { prevented = true; },
				stopPropagation: () => { },
			} as unknown as MouseEvent;

			controller['onOverviewRulerClick'](event);
			controller['onOverviewRulerMouseUp'](event);

			assert.strictEqual(prevented, false);
		});
	});

	suite('lifecycle and memory leaks', () => {
		test('after dispose: container is removed from DOM, maps are empty, and no parent listeners remain', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const calls: string[] = [];
			const host = new class extends FakeHost {
				constructor() {
					super({ renderHeight: 200, scrollHeight: 200, items: [req], heights, tops, layoutInfo });
				}
				override reveal() { calls.push('reveal'); }
				override focusItem() { calls.push('focusItem'); }
			}();
			const controller = disposables.add(new ChatScrollbarPromptMarkerController(
				host,
				makeConfigService(ChatScrollbarPromptMarkerClickBehavior.Reveal),
				makeFileService(),
				new NullLogService(),
			));

			controller.layout();
			assert.ok(controller['container'].parentElement);

			controller.dispose();

			assert.strictEqual(controller['container'].parentElement, null);
			assert.strictEqual(controller['parentPointerDownListener'].value, undefined);
			assert.strictEqual(controller['parentClickListener'].value, undefined);
			assert.strictEqual(controller['parentMouseUpListener'].value, undefined);

			// Dispatching events on the former parent should not call any host methods
			calls.length = 0;
			layoutInfo.parent.dispatchEvent(new PointerEvent('pointerdown'));
			layoutInfo.parent.dispatchEvent(new MouseEvent('click'));
			layoutInfo.parent.dispatchEvent(new MouseEvent('mouseup'));
			assert.deepStrictEqual(calls, []);
		});

		test('repeated layout calls with the same parent do not register additional listeners', () => {
			const layoutInfo = makeLayoutInfo(14);
			const host = new FakeHost({ renderHeight: 200, scrollHeight: 200, layoutInfo });
			const controller = createController(host);

			controller.layout();
			const firstPointerDown = controller['parentPointerDownListener'].value;

			controller.layout();
			controller.layout();
			const finalPointerDown = controller['parentPointerDownListener'].value;

			assert.strictEqual(firstPointerDown, finalPointerDown);
		});

		test('renderMarkers called many times with the same descriptors does not leak stale nodes', () => {
			const req = makeRequest('r1');
			const layoutInfo = makeLayoutInfo(14);
			const heights = new Map([['r1', 100]]);
			const tops = new Map([['r1', 0]]);
			const host = new FakeHost({
				renderHeight: 200, scrollHeight: 200,
				items: [req], heights, tops, layoutInfo,
			});
			const controller = createController(host);

			controller.layout();
			for (let i = 0; i < 20; i++) {
				controller.refresh();
			}

			assert.strictEqual(controller['container'].querySelectorAll('.chat-scrollbar-prompt-marker').length, 1);
			assert.strictEqual(controller['markerById'].size, 1);
		});
	});
});
