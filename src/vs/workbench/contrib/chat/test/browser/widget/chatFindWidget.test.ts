/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event as BaseEvent } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { createRegExp } from '../../../../../../base/common/strings.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatTreeItem } from '../../../browser/chat.js';
import { IChatListItemTemplate } from '../../../browser/widget/chatListRenderer.js';
import { ChatFindModel } from '../../../browser/widget/chatFind/chatFindModel.js';
import { ChatFindWidget, computeRevealScrollTop, findMatchRangesInDom, IChatFindHost, openAncestorDisclosures, rangesEqual, shouldCaptureFocusBeforeShow } from '../../../browser/widget/chatFind/chatFindWidget.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatFindWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(items: readonly ChatTreeItem[] = [], overrides?: Partial<IChatFindHost>) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const container = document.createElement('div');
		const transcriptDomNode = container.appendChild(document.createElement('div'));
		const host: IChatFindHost = {
			transcriptDomNode,
			getItems: () => items,
			onDidChangeContent: BaseEvent.None,
			reveal: () => { },
			getTemplateDataForRequestId: () => undefined,
			onDidRerenderRow: BaseEvent.None,
			editorsInUse: () => [],
			getCodeBlockInfoForEditor: () => undefined,
			getScrollTop: () => 0,
			setScrollTop: () => { },
			getRenderHeight: () => 0,
			getViewportAnchorItemId: () => undefined,
			...overrides,
		};
		const widget = disposables.add(instantiationService.createInstance(ChatFindWidget, host));
		const model = Reflect.get(widget, '_model') as ChatFindModel;
		return { disposables, model, widget, container };
	}

	test('does not search intermediate IME composition text', async () => {
		const { model, widget } = createWidget();
		widget.show(undefined, false);
		const input = widget.getDomNode().querySelector('input');
		assert.ok(input);

		input.dispatchEvent(new Event('compositionstart'));
		input.value = 'n';
		input.dispatchEvent(new Event('input'));
		await timeout(200);
		const duringComposition = model.query;

		input.value = '你好';
		input.dispatchEvent(new Event('compositionend'));
		input.dispatchEvent(new Event('input'));
		await timeout(200);

		assert.deepStrictEqual({
			duringComposition,
			afterComposition: model.query,
		}, {
			duringComposition: '',
			afterComposition: '你好',
		});
	});

	test('next and previous reopen the hidden widget and continue from the active match without focusing it', async () => {
		const item = { id: 'request', message: {}, messageText: 'needle needle needle' } as unknown as ChatTreeItem;
		const next = createWidget([item]);
		const previous = createWidget([item]);
		Reflect.set(next.widget, '_navigateToActive', () => { });
		Reflect.set(previous.widget, '_navigateToActive', () => { });
		const focusedElement = document.activeElement;

		next.widget.show('needle', false);
		next.model.next();
		next.widget.hide();
		previous.widget.show('needle', false);
		previous.model.next();
		previous.widget.hide();
		await timeout(250);

		next.widget.next();
		previous.widget.previous();
		await timeout(0);

		assert.deepStrictEqual({
			nextQuery: next.model.query,
			nextActiveIndex: next.model.activeIndex,
			nextVisible: next.widget.visible,
			nextRendered: next.widget.getDomNode().querySelector('.simple-find-part')?.classList.contains('visible'),
			previousQuery: previous.model.query,
			previousActiveIndex: previous.model.activeIndex,
			previousVisible: previous.widget.visible,
			previousRendered: previous.widget.getDomNode().querySelector('.simple-find-part')?.classList.contains('visible'),
			focusedElement: document.activeElement,
		}, {
			nextQuery: 'needle',
			nextActiveIndex: 2,
			nextVisible: true,
			nextRendered: true,
			previousQuery: 'needle',
			previousActiveIndex: 0,
			previousVisible: true,
			previousRendered: true,
			focusedElement,
		});
		next.disposables.dispose();
		previous.disposables.dispose();
	});

	suite('older history', () => {
		function createPagedWidget(recent = '') {
			const items: ChatTreeItem[] = [];
			const templates = new Map<string, IChatListItemTemplate>();
			function prepend(id: string, text: string) {
				const value = document.createElement('div');
				value.textContent = text;
				templates.set(id, upcastPartial<IChatListItemTemplate>({ value }));
				items.unshift(upcastPartial<IChatRequestViewModel>({ id, message: { text, parts: [] }, messageText: text }));
			}
			prepend('recent', recent);
			const cursor = observableValue<string | undefined>('cursor', 'p1');
			const unavailable = observableValue('unavailable', false);
			const transcriptVisible = observableValue('transcriptVisible', true);
			const notInTree = new Set<string>();
			const content = store.add(new Emitter<void>());
			const reads: string[] = [];
			const reveals: string[] = [];
			let pending: DeferredPromise<void> | undefined;
			function loadOlderHistory() {
				if (!pending) {
					reads.push(cursor.get()!);
					pending = new DeferredPromise<void>();
				}
				return pending.p;
			}
			const activeModel = observableValue<IChatModel | undefined>('active model', upcastPartial<IChatModel>({ olderHistoryCursor: cursor, olderHistoryUnavailable: unavailable, loadOlderHistory }));
			const fixture = createWidget(items, {
				activeModel,
				transcriptVisible,
				getTemplateDataForRequestId: id => id ? templates.get(id) : undefined,
				onDidChangeContent: content.event,
				hasElement: item => !notInTree.has(item.id),
				reveal: item => {
					assert.ok(!notInTree.has(item.id), 'cannot reveal an element before the list refresh');
					reveals.push(item.id);
				},
			});
			const count = fixture.widget.getDomNode().querySelector<HTMLElement>('.matchesCount')!;
			async function finish(next: string | undefined, text?: string, error?: Error) {
				assert.ok(pending);
				if (text) {
					prepend(cursor.get()!, text);
				}
				cursor.set(next, undefined);
				content.fire();
				const page = pending;
				pending = undefined;
				if (error) {
					await page.error(error);
				} else {
					await page.complete();
				}
				await timeout(0);
			}
			const label = (expected: string) => retry(async () => assert.strictEqual(count.textContent, expected), 10, 100);
			return { ...fixture, activeModel, transcriptVisible, cursor, unavailable, notInTree, content, reads, reveals, prepend, loadOlderHistory, finish, label };
		}

		test('searches pages in order with the current options and stops at the first matching page', async () => {
			const { widget, reads, reveals, finish, label } = createPagedWidget('Marker12');
			widget.show(undefined, false);
			widget.toggleRegex();
			widget.toggleWholeWord();
			widget.toggleCaseSensitive();
			widget.show('marker\\d+');
			await label('Searching…');
			await finish('p2', 'prefixmarker12');
			await finish('p3', 'found marker42 here');
			await label('1 of 1+');
			assert.deepStrictEqual({ reads, reveals }, { reads: ['p1', 'p2'], reveals: ['p2'] });
		});

		test('navigates past the known boundary to the nearest unseen occurrence before wrapping', async () => {
			const { widget, model, container, reads, reveals, finish, label } = createPagedWidget('needle needle');
			document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			widget.show('needle');
			await label('1 of 2+');
			widget.find(false);
			await label('2 of 2+');
			assert.deepStrictEqual(reads, []);
			widget.find(false);
			widget.find(false);
			await label('Searching…');
			await finish('p2', 'no match');
			assert.deepStrictEqual([model.activeMatch?.itemId, model.activeMatch?.occurrenceIndex], ['recent', 0]);
			await finish('p3', 'needle needle');
			await label('3 of 4+');
			assert.deepStrictEqual([model.activeMatch?.itemId, model.activeMatch?.occurrenceIndex], ['p2', 1]);
			widget.find(false);
			await label('4 of 4+');
			widget.find(false);
			await finish(undefined);
			await label('1 of 4');
			assert.deepStrictEqual({ reads, reveals, focused: document.activeElement === widget.getDomNode().querySelector('input') }, {
				reads: ['p1', 'p2', 'p3'], reveals: ['recent', 'recent', 'p2', 'p2', 'recent'], focused: true,
			});
		});

		test('a new query can reuse a shared pending page without continuing the released search', async () => {
			const { widget, loadOlderHistory, reads, reveals, finish, label } = createPagedWidget();
			const externalRead = loadOlderHistory();
			widget.show('not here');
			await label('Searching…');
			const input = widget.getDomNode().querySelector('input')!;
			input.value = 'needle';
			input.dispatchEvent(new Event('input'));
			widget.find(false);
			await finish('p2', 'needle');
			await externalRead;
			await label('1 of 1+');
			assert.deepStrictEqual({ reads, reveals }, { reads: ['p1'], reveals: ['p1'] });
		});

		test('a newly loaded hit releases a still-pending read without losing the selected occurrence', async () => {
			const { widget, content, prepend, reads, reveals, finish, label, model } = createPagedWidget();
			widget.show('needle');
			await label('Searching…');
			prepend('streamed', 'needle needle');
			content.fire();
			await label('1 of 2+');
			await finish('p2', 'needle');
			await label('1 of 3+');
			assert.deepStrictEqual({ reads, reveals, occurrence: model.activeMatch?.occurrenceIndex }, { reads: ['p1'], reveals: ['streamed'], occurrence: 1 });
		});

		test('changing options releases a pending read when a loaded occurrence now matches', async () => {
			const { widget, reads, reveals, finish, label } = createPagedWidget('NEEDLE');
			widget.show(undefined, false);
			widget.toggleCaseSensitive();
			widget.show('needle');
			await label('Searching…');
			widget.toggleCaseSensitive();
			await label('1 of 1+');
			await finish('p2', 'needle');
			await label('1 of 2+');
			assert.deepStrictEqual({ reads, reveals }, { reads: ['p1'], reveals: ['recent'] });
		});

		test('empty and invalid queries do not read and hiding Find releases an outstanding read', async () => {
			const { widget, content, reads, reveals, finish, label } = createPagedWidget();
			content.fire();
			widget.show(undefined, false);
			widget.toggleRegex();
			widget.show('[');
			widget.find(false);
			assert.deepStrictEqual(reads, []);
			widget.show('needle');
			await label('Searching…');
			widget.hide();
			await finish('p2', 'needle');
			content.fire();
			widget.find(false);
			await timeout(220);
			assert.deepStrictEqual({ reads, reveals, visible: widget.visible }, { reads: ['p1'], reveals: [], visible: false });
		});

		for (const end of ['switch', 'dispose'] as const) {
			test(`a pending page cannot navigate or start another read after ${end}`, async () => {
				const { widget, activeModel, reads, reveals, finish, label } = createPagedWidget();
				widget.show('needle');
				await label('Searching…');
				if (end === 'switch') {
					activeModel.set(upcastPartial<IChatModel>({}), undefined);
				} else {
					widget.dispose();
				}
				await finish('p2', 'needle');
				assert.deepStrictEqual({ reads, reveals, visible: widget.visible }, { reads: ['p1'], reveals: [], visible: false });
			});
		}

		test('unchanged cursors and failed reads stay incomplete until deliberate navigation retries', async () => {
			const { widget, reads, finish, label } = createPagedWidget();
			widget.show('needle');
			await finish('p1');
			await label('Search incomplete');
			const next = widget.getDomNode().querySelector<HTMLElement>('.codicon-find-next-match')!;
			assert.strictEqual(next.classList.contains('disabled'), false);
			next.click();
			await finish('p1', undefined, new Error('offline'));
			await label('Search incomplete');
			widget.find(true);
			await finish(undefined);
			await label('No results');
			assert.deepStrictEqual(reads, ['p1', 'p1', 'p1']);
		});

		test('history without a usable cursor or loader is not counted as a complete search', async () => {
			const { widget, activeModel, loadOlderHistory, cursor, reads, label } = createPagedWidget();
			for (const model of [{ loadOlderHistory }, { olderHistoryCursor: cursor }]) {
				activeModel.set(upcastPartial<IChatModel>(model), undefined);
				widget.show('needle');
				widget.find(false);
				await label('Search incomplete');
			}
			assert.deepStrictEqual(reads, []);
		});

		test('counts a page before the tree refresh and reveals only the still-active occurrence afterward', async () => {
			const { widget, notInTree, content, reveals, finish, label } = createPagedWidget();
			notInTree.add('p1');
			widget.show('needle');
			await finish('p2', 'needle');
			await label('1 of 1+');
			assert.deepStrictEqual(reveals, []);
			notInTree.clear();
			content.fire();
			await retry(async () => assert.deepStrictEqual(reveals, ['p1']), 10, 100);
			notInTree.add('p2');
			widget.find(false);
			await finish(undefined, 'needle');
			await label('2 of 2');
			widget.show('different');
			notInTree.clear();
			content.fire();
			await label('No results');
			await timeout(220);
			assert.deepStrictEqual(reveals, ['p1']);
		});

		test('Previous visits every occurrence on a newly loaded page before it requests another', async () => {
			for (const next of [undefined, 'p2']) {
				const { widget, model, reads, finish, label } = createPagedWidget('needle needle');
				widget.show('needle');
				await label('1 of 2+');
				widget.find(true);
				await finish(next, 'needle needle');
				await label(next ? '4 of 4+' : '4 of 4');
				const oldest = model.activeMatch?.occurrenceIndex;
				widget.find(true);
				await label(next ? '3 of 4+' : '3 of 4');
				assert.deepStrictEqual([oldest, model.activeMatch?.itemId, model.activeMatch?.occurrenceIndex, reads], [0, 'p1', 1, ['p1']]);
			}
		});

		test('a failed boundary read still wraps through loaded hits and can be retried', async () => {
			const { widget, reads, finish, label } = createPagedWidget('needle needle');
			widget.show('needle');
			await label('1 of 2+');
			widget.find(true);
			await finish('p1', undefined, new Error('offline'));
			await label('2 of 2+ (search incomplete)');
			widget.find(false);
			await finish(undefined);
			await label('1 of 2');
			assert.deepStrictEqual(reads, ['p1', 'p1']);
		});

		test('hiding the transcript pauses paging but retains the search in the same chat', async () => {
			const { widget, transcriptVisible, reads, reveals, finish, label } = createPagedWidget();
			widget.show('needle');
			await label('Searching…');
			transcriptVisible.set(false, undefined);
			await finish('p2');
			widget.find(false);
			assert.deepStrictEqual({ visible: widget.visible, reads, reveals }, { visible: true, reads: ['p1'], reveals: [] });
			transcriptVisible.set(true, undefined);
			await label('Searching…');
			await retry(async () => assert.strictEqual(reads.length, 2), 10, 100);
			await finish(undefined, 'needle');
			await label('1 of 1');
		});

		test('another reader advancing or exhausting the failed cursor clears the failure', async () => {
			const { widget, reads, cursor, finish, label } = createPagedWidget();
			widget.show('absent');
			await finish('p1', undefined, new Error('offline'));
			await label('Search incomplete');
			cursor.set('p2', undefined);
			await label('Searching…');
			await finish('p2');
			await label('Search incomplete');
			cursor.set(undefined, undefined);
			await label('No results');
			assert.deepStrictEqual(reads, ['p1', 'p2']);
		});

		test('suspending history releases the read and keeps counts partial without requesting another page', async () => {
			const { widget, cursor, unavailable, reads, finish, label } = createPagedWidget();
			widget.show('needle');
			await label('Searching…');
			unavailable.set(true, undefined);
			await finish('p2');
			await label('Search incomplete');
			widget.find(false);
			cursor.set(undefined, undefined);
			widget.find(true);
			await label('Search incomplete');
			unavailable.set(false, undefined);
			await label('No results');
			assert.deepStrictEqual(reads, ['p1']);
		});
	});
});

suite('ChatFindWidget DOM highlighting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function regex(query: string) {
		return createRegExp(query, false, { matchCase: false, wholeWord: false, global: true, unicode: true });
	}

	test('finds matches within a single text node', () => {
		const root = document.createElement('div');
		root.textContent = 'the quick brown fox jumps over the lazy dog';

		const ranges = findMatchRangesInDom(root, regex('the'), 100);

		assert.strictEqual(ranges.length, 2);
		for (const range of ranges) {
			assert.strictEqual(range.toString().toLowerCase(), 'the');
		}
	});

	test('finds matches split across nested inline elements (e.g. bold markdown)', () => {
		const root = document.createElement('div');
		// Simulates rendered markdown like "the **quick** brown fox", where a
		// match's surrounding text lives in sibling/nested text nodes.
		root.innerHTML = 'the <b>quick</b> brown <em>fox</em> jumps';

		const ranges = findMatchRangesInDom(root, regex('quick'), 100);

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].toString(), 'quick');
	});

	test('respects a match limit (only mounted/visible content is ever scanned)', () => {
		const root = document.createElement('div');
		root.textContent = new Array(20).fill('needle').join(' ');

		const ranges = findMatchRangesInDom(root, regex('needle'), 5);

		assert.strictEqual(ranges.length, 5);
	});

	test('does not fuse text across block boundaries', () => {
		const root = document.createElement('div');
		// Two paragraphs whose seam would read as "needle" if blocks were concatenated.
		root.innerHTML = '<p>nee</p><p>dle</p>';

		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100), []);
	});

	test('keeps inline formatting on one line so whole-word matches survive', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>the <b>nee</b><i>dle</i> here</p>';

		const ranges = findMatchRangesInDom(root, createRegExp('needle', false, { matchCase: false, wholeWord: true, global: true, unicode: true }), 100);

		assert.strictEqual(ranges.length, 1);
		assert.strictEqual(ranges[0].toString(), 'needle');
	});

	test('excludes embedded editor text without joining surrounding text', () => {
		const root = document.createElement('div');
		root.append('nee');
		const editor = root.appendChild(document.createElement('div'));
		editor.textContent = 'needle';
		root.append('dle');

		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100, [editor]), []);
	});

	test('excludes marked preview chrome without shifting response matches', () => {
		const root = document.createElement('div');
		root.innerHTML = '<div data-chat-find-ignore><button>Show Source</button><div hidden>Show Source</div></div><p>Show Source in the response.</p>';
		assert.deepStrictEqual(findMatchRangesInDom(root, regex('Show Source'), 100).map(range => ({
			text: range.toString(), parent: range.startContainer.parentElement?.tagName,
		})), [{ text: 'Show Source', parent: 'P' }]);
	});

	test('returns no ranges when there is no text content', () => {
		const root = document.createElement('div');
		assert.deepStrictEqual(findMatchRangesInDom(root, regex('needle'), 100), []);
	});

	test('rangesEqual compares by container/offset, not by reference', () => {
		const root = document.createElement('div');
		root.textContent = 'needle';

		const [a] = findMatchRangesInDom(root, regex('needle'), 100);
		const [b] = findMatchRangesInDom(root, regex('needle'), 100);

		assert.notStrictEqual(a, b, 'sanity: these are distinct Range objects');
		assert.strictEqual(rangesEqual(a, b), true);
	});

	test('uses the root element\'s own document, not the global document', () => {
		// Simulates a node owned by another window/document (e.g. an
		// auxiliary window), which must not be scanned/ranged via globals.
		const otherDocument = document.implementation.createHTMLDocument('');
		const root = otherDocument.createElement('div');
		root.textContent = 'needle';

		const [range] = findMatchRangesInDom(root, regex('needle'), 100);

		assert.strictEqual(range.toString(), 'needle');
		assert.strictEqual(range.startContainer.ownerDocument, otherDocument);
	});

	test('openAncestorDisclosures opens every closed <details> ancestor up to root', () => {
		const root = document.createElement('div');
		root.innerHTML = '<details><summary>a</summary><details><summary>b</summary><span>needle</span></details></details>';
		const outer = root.querySelector<HTMLDetailsElement>('details')!;
		const inner = root.querySelector<HTMLDetailsElement>('details details')!;
		const target = root.querySelector('span')!.firstChild!;

		const opened = openAncestorDisclosures(root, target);

		assert.strictEqual(opened, true);
		assert.strictEqual(outer.open, true);
		assert.strictEqual(inner.open, true);
	});

	test('openAncestorDisclosures does not open <details> outside of root, and reports false when nothing changes', () => {
		const outside = document.createElement('details');
		const root = document.createElement('div');
		root.innerHTML = '<details open><span>needle</span></details>';
		outside.appendChild(root);
		const target = root.querySelector('span')!.firstChild!;

		const opened = openAncestorDisclosures(root, target);

		assert.strictEqual(opened, false, 'the already-open details inside root needed no change');
		assert.strictEqual(outside.open, false, 'details outside root must not be touched');
	});

	test('shouldCaptureFocusBeforeShow only captures focus when opening from hidden', () => {
		assert.strictEqual(shouldCaptureFocusBeforeShow(false), true, 'opening from hidden captures the pre-Find focus target');
		assert.strictEqual(shouldCaptureFocusBeforeShow(true), false, 'reopening while already visible must not overwrite it');
	});
});

/**
 * Covers revealing a match in both directions. The chat list only picks up native scrolling as a
 * downward delta (see `scrollToActiveElement` in `listView.ts`), so scrolling up — including the
 * wrap from the last match back to the first — has to be driven through the list's own scroll
 * offset. These tests pin that arithmetic.
 */
suite('ChatFindWidget match reveal', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// scrollTop 500, viewport 400 tall, padding 30.
	const scrollTop = 500;
	const renderHeight = 400;

	test('leaves a match that is already comfortably in view alone', () => {
		assert.strictEqual(computeRevealScrollTop(scrollTop, renderHeight, 100, 120), undefined);
	});

	test('scrolls up to a match above the viewport', () => {
		// The wrap-around case: the match sits 60px above the top edge.
		assert.strictEqual(computeRevealScrollTop(scrollTop, renderHeight, -60, -40), 500 - 60 - 30);
	});

	test('scrolls down by the least amount that clears the bottom edge', () => {
		assert.strictEqual(computeRevealScrollTop(scrollTop, renderHeight, 390, 410), 500 + 410 - 400 + 30);
	});

	test('aligns the top of a match too tall to fit the viewport', () => {
		assert.strictEqual(computeRevealScrollTop(scrollTop, renderHeight, 40, 600), 500 + 40 - 30);
	});

	test('never scrolls above the start of the transcript', () => {
		assert.strictEqual(computeRevealScrollTop(10, renderHeight, -200, -180), 0);
	});
});

/**
 * Drives the reveal through the widget's private scroll helper with a fake host, so the
 * measure-and-scroll wiring is covered without the widget's service graph.
 */
suite('ChatFindWidget scroll wiring', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const scrollRectIntoView = Reflect.get(ChatFindWidget.prototype, '_scrollRectIntoView') as (this: IScrollHarness, rect: { top: number; bottom: number } | undefined) => boolean;

	interface IScrollHarness {
		host: {
			transcriptDomNode: { getBoundingClientRect(): { top: number } };
			getScrollTop(): number;
			setScrollTop(scrollTop: number): void;
			getRenderHeight(): number;
		};
	}

	/** Scrolls to a match whose rect is given in client coordinates, and reports the writes. */
	function reveal(rect: { top: number; bottom: number } | undefined, scrollTop = 500) {
		const writes: number[] = [];
		const harness: IScrollHarness = {
			host: {
				// The transcript viewport starts 100px down the client area.
				transcriptDomNode: { getBoundingClientRect: () => ({ top: 100 }) },
				getScrollTop: () => scrollTop,
				setScrollTop: (value: number) => writes.push(value),
				getRenderHeight: () => 400,
			},
		};
		const scrolled = scrollRectIntoView.call(harness, rect);
		return { writes, scrolled };
	}

	test('scrolls the list up when the match is above the viewport', () => {
		// Client top 40 is 60px above the transcript's top edge.
		assert.deepStrictEqual(reveal({ top: 40, bottom: 60 }), { writes: [500 - 60 - 30], scrolled: true });
	});

	test('does not touch the list when the match is already in view', () => {
		assert.deepStrictEqual(reveal({ top: 200, bottom: 220 }), { writes: [], scrolled: false });
	});

	test('does nothing when the match could not be measured', () => {
		assert.deepStrictEqual(reveal(undefined), { writes: [], scrolled: false });
	});
});

/**
 * Exercises the walk that moves past matches the DOM cannot produce. Driving the private members
 * directly keeps the test free of the widget's service graph while still covering the real
 * direction, cap and termination behaviour.
 */
suite('ChatFindWidget unlocatable match walk', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const skipUnlocatableMatch = Reflect.get(ChatFindWidget.prototype, '_skipUnlocatableMatch') as (this: IWalkHarness) => void;
	const maxSkips = Reflect.get(ChatFindWidget, 'MAX_UNLOCATABLE_SKIPS') as number;

	interface IWalkHarness {
		_unlocatableSkips: number;
		_lastNavigationWasPrevious: boolean;
		_completeSettle(): void;
		_advanceActiveMatch(previous: boolean): void;
	}

	/** Walks `locatable` from `startIndex`, stepping past entries the DOM cannot produce. */
	function runWalk(locatable: readonly boolean[], startIndex: number, previous: boolean) {
		const directions: boolean[] = [];
		let index = startIndex;
		const harness: IWalkHarness = {
			_unlocatableSkips: 0,
			_lastNavigationWasPrevious: previous,
			_completeSettle() { },
			_advanceActiveMatch(wasPrevious: boolean) {
				directions.push(wasPrevious);
				index = (index + (wasPrevious ? -1 : 1) + locatable.length) % locatable.length;
				if (!locatable[index]) {
					skipUnlocatableMatch.call(harness);
				}
			},
		};

		harness._advanceActiveMatch(previous);
		return { index, directions, skips: harness._unlocatableSkips };
	}

	test('advances past unlocatable matches to the next locatable one', () => {
		// index 0 active; 1 and 2 cannot be located, 3 can.
		const result = runWalk([true, false, false, true], 0, false);

		assert.strictEqual(result.index, 3);
		assert.strictEqual(result.skips, 2, 'skipped exactly the two unlocatable matches');
	});

	test('keeps walking backwards when navigating to the previous match', () => {
		const result = runWalk([true, false, false, true], 3, true);

		assert.strictEqual(result.index, 0);
		assert.deepStrictEqual(result.directions, [true, true, true], 'every step kept the direction');
	});

	test('stops at the cap when nothing can be located', () => {
		const result = runWalk(new Array(200).fill(false), 0, false);

		assert.strictEqual(result.skips, maxSkips, 'gave up at the cap instead of spinning');
	});
});

/**
 * Covers holding the result count until the search and its match location have settled, so the
 * label shows the final number instead of counting up and down while the user types.
 */
suite('ChatFindWidget settled result count', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const whenSettled = Reflect.get(ChatFindWidget.prototype, '_whenSettled') as (this: ISettleHarness) => Promise<void>;
	const beginSettle = Reflect.get(ChatFindWidget.prototype, '_beginSettle') as (this: ISettleHarness) => void;
	const completeSettle = Reflect.get(ChatFindWidget.prototype, '_completeSettle') as (this: ISettleHarness) => void;

	interface ISettleHarness {
		_pendingSearch: Promise<void> | undefined;
		_settleBarrier: DeferredPromise<void> | undefined;
	}

	test('waits for an in-flight match location before reporting', async () => {
		const harness: ISettleHarness = { _pendingSearch: undefined, _settleBarrier: undefined };
		beginSettle.call(harness);

		let settled = false;
		const waiting = whenSettled.call(harness).then(() => { settled = true; });

		await Promise.resolve();
		assert.strictEqual(settled, false, 'still locating, so the count must not be read yet');

		completeSettle.call(harness);
		await waiting;
		assert.strictEqual(settled, true);
	});

	test('waits for a debounced search that has not run yet', async () => {
		const search = new DeferredPromise<void>();
		const harness: ISettleHarness = { _pendingSearch: search.p, _settleBarrier: undefined };

		let settled = false;
		const waiting = whenSettled.call(harness).then(() => { settled = true; });

		await Promise.resolve();
		assert.strictEqual(settled, false, 'the query has not been searched yet');

		harness._pendingSearch = undefined;
		await search.complete();
		await waiting;
		assert.strictEqual(settled, true);
	});

	test('keeps waiting when a newer keystroke supersedes the search it was waiting on', async () => {
		const first = new DeferredPromise<void>();
		const second = new DeferredPromise<void>();
		const harness: ISettleHarness = { _pendingSearch: first.p, _settleBarrier: undefined };

		let settled = false;
		const waiting = whenSettled.call(harness).then(() => { settled = true; });

		// Typing again while the first search was pending.
		harness._pendingSearch = second.p;
		await first.complete();
		await Promise.resolve();
		assert.strictEqual(settled, false, 'the newer search has to finish too');

		harness._pendingSearch = undefined;
		await second.complete();
		await waiting;
		assert.strictEqual(settled, true);
	});

	test('returns immediately when nothing is in flight', async () => {
		const harness: ISettleHarness = { _pendingSearch: undefined, _settleBarrier: undefined };

		await whenSettled.call(harness);
	});

	test('completing twice is safe, so cleanup paths cannot strand a waiter', async () => {
		const harness: ISettleHarness = { _pendingSearch: undefined, _settleBarrier: undefined };
		beginSettle.call(harness);
		const waiting = whenSettled.call(harness);

		completeSettle.call(harness);
		completeSettle.call(harness);

		await waiting;
		assert.strictEqual(harness._settleBarrier, undefined);
	});
});
