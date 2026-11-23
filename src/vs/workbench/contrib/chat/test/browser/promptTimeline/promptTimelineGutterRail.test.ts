/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, append, getWindow } from '../../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getIconsStyleSheet } from '../../../../../../platform/theme/browser/iconsStyleSheet.js';
import { PromptTimelineGutterRail, restDotCount } from '../../../browser/promptTimeline/promptTimelineGutterRail.js';
import { PromptTick } from '../../../browser/promptTimeline/promptTimelineModel.js';

suite('PromptTimelineGutterRail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function tick(index: number, stat?: PromptTick['stat']): PromptTick {
		const requestId = String(index);
		return { requestId, allRequestIds: [requestId], text: requestId, timestamp: index, count: 1, ariaLabel: requestId, stat };
	}

	/** Mounts a rail with `ticks` in the document, so focus and keyboard navigation behave for real. */
	function createRail(ticks: readonly PromptTick[]): PromptTimelineGutterRail {
		const rail = store.add(new PromptTimelineGutterRail());
		document.body.appendChild(rail.domNode);
		store.add(toDisposable(() => rail.domNode.remove()));
		rail.setTicks(ticks);
		return rail;
	}

	function rowParts(rail: PromptTimelineGutterRail) {
		return Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row')).map(row => ({
			row,
			jump: row.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-row-jump')!,
			diff: row.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-row-diff')!,
		}));
	}

	function keydown(target: HTMLElement, key: string, keyCode: number): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
	}

	test('shows the chevron only at the open, loadable top edge without loading on hover', () => {
		const rail = createRail(Array.from({ length: 10 }, (_, i) => tick(151 + i)));
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		const handle = rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-rest')!;
		append(rail.domNode, $('style')).textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
		panel.style.maxHeight = '100px';
		const visible = () => {
			const button = panel.querySelector<HTMLElement>('[role=button]');
			const chevron = button?.querySelector<HTMLElement>('.codicon');
			return !!chevron && chevron.getClientRects().length > 0 && getWindow(chevron).getComputedStyle(chevron, '::before').content !== 'none';
		};
		const hover = () => panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		hover();
		const complete = visible();
		panel.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
		let loads = 0;
		rail.setOlderHistoryLoader(async () => { loads++; });
		const closed = visible();
		hover();
		const atTop = visible();
		panel.scrollTop = panel.scrollHeight;
		panel.dispatchEvent(new Event('scroll'));
		const scrolled = visible();
		keydown(rowParts(rail).at(-1)!.jump, 'Home', 36);
		panel.dispatchEvent(new Event('scroll'));
		const afterHome = visible();
		rail.setOlderHistoryLoader(undefined);
		assert.deepStrictEqual({ complete, closed, atTop, scrolled, afterHome, exhausted: visible(), hint: handle.ariaDescription, loads },
			{ complete: false, closed: false, atTop: true, scrolled: false, afterHome: true, exhausted: false, hint: null, loads: 0 });
	});

	test('clicking the full chevron strip shows an earlier page; keyboard activation reaches the start', async () => {
		const recent = Array.from({ length: 10 }, (_, i) => tick(21 + i));
		const earlier = Array.from({ length: 10 }, (_, i) => tick(11 + i));
		const firstPage = new DeferredPromise<void>();
		const rail = createRail(recent);
		const selected: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		panel.style.maxHeight = '100px';
		panel.style.transition = 'none';
		for (const size of [4, 24, 32]) {
			panel.style.setProperty(`--vscode-spacing-size${size * 10}`, `${size}px`);
		}
		let loads = 0;
		rail.setOlderHistoryLoader(async () => {
			if (++loads === 1) {
				await firstPage.p;
				for (let i = earlier.length - 1; i >= 0; i--) {
					rail.setTicks([...earlier.slice(i), ...recent]);
				}
			} else {
				rail.setOlderHistoryLoader(undefined);
				rail.setTicks([tick(2), ...earlier, ...recent]);
				rail.setTicks([tick(1), tick(2), ...earlier, ...recent]);
			}
		});
		panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const button = panel.querySelector<HTMLElement>('[role=button][aria-label="Load Earlier Prompts"]')!;
		const area = button.getBoundingClientRect();
		const edge = panel.getBoundingClientRect();
		const hit = (x: number) => document.elementFromPoint(x, area.top + area.height / 2);
		assert.ok(area.height >= 24 && area.width >= panel.clientWidth - 10 && hit(edge.left + 8) === button && hit(edge.left + panel.clientWidth - 8) === button,
			`button ${JSON.stringify(area)}, panel ${JSON.stringify(edge)}, hit ${hit(edge.left + 8)?.className} / ${hit(edge.left + panel.clientWidth - 8)?.className}`);
		hit(edge.left + 8)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		button.click();
		const pending = { loads, disabled: button.ariaDisabled };
		await firstPage.complete();
		await Promise.resolve();
		const first = { top: panel.scrollTop, prompt: rowParts(rail)[0].jump.textContent, focused: document.activeElement === button, chevron: !!button.querySelector('.codicon-chevron-up-compact') };
		keydown(button, 'Enter', 13);
		await Promise.resolve();
		assert.deepStrictEqual({ pending, first, loads, selected, hidden: !button.getClientRects().length, focused: document.activeElement?.textContent },
			{ pending: { loads: 1, disabled: 'true' }, first: { top: 0, prompt: '11', focused: true, chevron: true }, loads: 2, selected: [], hidden: true, focused: '1' });
	});

	test('cycles one, two, three loading dots, keeps all three for reduced motion and restores the chevron on failure', async () => {
		const rail = createRail([tick(1), tick(2)]);
		rail.domNode.classList.add('monaco-enable-motion');
		append(rail.domNode, $('style')).textContent = store.add(getIconsStyleSheet(undefined)).getCSS().toString();
		const page = new DeferredPromise<void>();
		rail.setOlderHistoryLoader(() => page.p);
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		panel.style.transition = 'none';
		panel.style.setProperty('--vscode-spacing-size240', '24px');
		panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const button = panel.querySelector<HTMLElement>('[role=button]')!;
		button.click();
		const busy = button.ariaBusy;
		const dots = button.querySelector<HTMLElement>('.codicon-ellipsis')!;
		const visibleDots = () => {
			const { left, top, width, height } = dots.getBoundingClientRect();
			return [0.25, 0.5, 0.75].filter(x => document.elementFromPoint(left + width * x, top + height / 2) === dots).length;
		};
		const [animation] = dots.getAnimations();
		animation.pause();
		const cycle = [0.1, 0.4, 0.8, 1.1].map(fraction => {
			animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
			return visibleDots();
		});
		rail.domNode.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		const reduced = { dots: visibleDots(), animations: dots.getAnimations().length };
		await page.error(new Error('offline'));
		assert.deepStrictEqual({ busy, cycle, reduced, retry: button.ariaDisabled, idle: button.ariaBusy, chevron: !!button.querySelector('.codicon-chevron-up-compact') },
			{ busy: 'true', cycle: [1, 2, 3, 1], reduced: { dots: 3, animations: 0 }, retry: 'false', idle: 'false', chevron: true });
	});

	test('loads one older page at the gutter boundary and preserves the focused row and column', async () => {
		const stat = { added: 1, removed: 0, fileCount: 1 };
		const recent = [tick(90, stat), tick(91)];
		const rail = createRail(recent);
		const page = new DeferredPromise<void>();
		let loads = 0;
		rail.setOlderHistoryLoader(async () => { loads++; await page.p; });
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		const selected: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		const first = rowParts(rail)[0].diff;
		rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-rest')!.click();
		keydown(rowParts(rail)[0].jump, 'ArrowRight', 39);
		const loadsBeforeGesture = loads;
		keydown(first, 'ArrowUp', 38);
		assert.strictEqual(loads, 1, 'Up at the first focused row must request a page');
		panel.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true }));
		keydown(first, 'ArrowUp', 38);
		rail.setTicks([tick(88), tick(89, stat), ...recent]);
		rail.setOlderHistoryLoader(undefined);
		await page.complete();
		const preserved = document.activeElement === first;
		keydown(first, 'ArrowUp', 38);
		const predecessor = rowParts(rail)[1];
		const focusedPrevious = document.activeElement === predecessor.diff;
		predecessor.jump.click();
		assert.deepStrictEqual({ loadsBeforeGesture, loads, preserved, focusedPrevious, selected, more: panel.classList.contains('has-older-prompts') },
			{ loadsBeforeGesture: 0, loads: 1, preserved: true, focusedPrevious: true, selected: ['89'], more: false });
	});

	test('a page arriving after the reader moves on does not take their place in the gutter', async () => {
		const recent = Array.from({ length: 10 }, (_, i) => tick(21 + i));
		const rail = createRail(recent);
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		panel.style.maxHeight = '100px';
		const page = new DeferredPromise<void>();
		rail.setOlderHistoryLoader(() => page.p);
		panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const button = panel.querySelector<HTMLElement>('[role=button]')!;
		button.click();
		keydown(button, 'End', 35);
		const last = rowParts(rail).at(-1)!.jump;
		const before = last.offsetTop - panel.scrollTop;
		rail.setTicks([tick(20), ...recent]);
		await page.complete();
		assert.deepStrictEqual({ focused: document.activeElement === last, top: last.offsetTop - panel.scrollTop },
			{ focused: true, top: before });
	});

	test('a page without user prompts still offers paging without inventing a prompt row', () => {
		const rail = createRail([]);
		let loads = 0;
		rail.setOlderHistoryLoader(async () => { loads++; });
		const handle = rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-rest')!;
		const idleLoads = loads;
		handle.click();
		assert.deepStrictEqual({ affordance: handle.matches('.has-older-prompts:empty'), rows: rowParts(rail).length, idleLoads, loads },
			{ affordance: true, rows: 0, idleLoads: 0, loads: 1 });
	});

	test('a failed wheel request waits for a new gesture to retry, without leaving the gutter', async () => {
		const rail = createRail([tick(90), tick(91)]);
		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;
		let attempts = 0;
		rail.setOlderHistoryLoader(async () => {
			if (++attempts === 1) {
				throw new Error('offline');
			}
			rail.setTicks([tick(89), tick(90), tick(91)]);
		});
		panel.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const wheel = (timeStamp: number) => {
			const event = new WheelEvent('wheel', { deltaY: -1, bubbles: true });
			Object.defineProperty(event, 'timeStamp', { value: timeStamp });
			panel.dispatchEvent(event);
		};
		wheel(1000);
		await Promise.resolve();
		const notified = !!panel.querySelector('[role=status]');
		wheel(1010);
		const afterMomentum = attempts;
		wheel(2000);
		await Promise.resolve();
		assert.deepStrictEqual({ notified, afterMomentum, error: !!panel.querySelector('[role=status]'), attempts, rows: rowParts(rail).map(r => r.jump.textContent) },
			{ notified: true, afterMomentum: 1, error: false, attempts: 2, rows: ['89', '90', '91'] });
	});

	test('highlights a row previewed from a dot, but leaves a row under the pointer to its own halves', () => {
		const rail = createRail(Array.from({ length: 3 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));

		rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const rowHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		dots[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const dotHover = {
			rows: rows.map(row => row.classList.contains('preview')),
			dots: dots.map(dot => dot.classList.contains('preview')),
		};

		assert.deepStrictEqual({ rowHover, dotHover }, {
			rowHover: {
				// The pointer is on the row, so its own half lights up instead. The dot still pairs.
				rows: [false, false, false],
				dots: [false, true, false],
			},
			dotHover: {
				// The pointer is over on the dot column, so the row itself highlights to point it out.
				rows: [false, false, true],
				dots: [false, false, true],
			},
		});
	});

	test('keeps an active row hover visible in high contrast', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench hc-black';
		root.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
		root.style.setProperty('--vscode-focusBorder', '#007fd4');
		root.style.setProperty('--vscode-strokeThickness', '1px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const rail = store.add(new PromptTimelineGutterRail());
		root.appendChild(rail.domNode);
		rail.setTicks([tick(0), tick(1)]);
		rail.setActive('1');
		const activeJump = rowParts(rail)[1].jump;
		activeJump.classList.add('hovered');
		const readOutline = () => {
			const style = getWindow(activeJump).getComputedStyle(activeJump);
			return {
				color: style.outlineColor,
				offset: style.outlineOffset,
				style: style.outlineStyle,
				width: style.outlineWidth,
			};
		};
		const hovered = readOutline();
		activeJump.classList.add('focus-visible');
		const focusedAndHovered = readOutline();

		assert.deepStrictEqual({
			active: activeJump.parentElement?.classList.contains('active'),
			hovered,
			focusedAndHovered,
		}, {
			active: true,
			hovered: { color: 'rgb(243, 133, 24)', offset: '-1px', style: 'dashed', width: '1px' },
			focusedAndHovered: { color: 'rgb(0, 127, 212)', offset: '-1px', style: 'solid', width: '1px' },
		});
	});

	test('maps row hover to the nearest sampled dot when capped', () => {
		const rail = store.add(new PromptTimelineGutterRail());
		rail.setTicks(Array.from({ length: 51 }, (_, index) => tick(index)));

		const rows = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-row'));
		const dots = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-dot'));
		rows[25].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

		assert.deepStrictEqual({
			dotCount: dots.length,
			previewDot: dots.findIndex(dot => dot.classList.contains('preview')),
		}, {
			dotCount: 50,
			previewDot: 24,
		});
	});

	test('splits a row into jump and review targets, hiding review when the prompt changed nothing', () => {
		const edited = tick(1, { added: 3, removed: 1, fileCount: 2 });
		const rail = createRail([tick(0), edited]);
		const selected: string[] = [];
		const reviewed: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		store.add(rail.onDidReview(t => reviewed.push(t.requestId)));

		const rows = rowParts(rail);
		rows[1].jump.click();
		rows[1].diff.click();

		assert.deepStrictEqual({
			reviewable: rows.map(row => row.row.classList.contains('reviewable')),
			selected,
			reviewed,
		}, {
			// Only the prompt that edited files offers the review target.
			reviewable: [false, true],
			selected: ['1'],
			reviewed: ['1'],
		});
	});

	test('moves between rows with Up/Down and between a row\'s targets with Left/Right', () => {
		const stat = { added: 1, removed: 0, fileCount: 1 };
		// Row 1 has no changes, so it has no review target to land on.
		const rail = createRail([tick(0, stat), tick(1), tick(2, stat)]);
		const rows = rowParts(rail);
		const list = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel')!;

		/** Where focus sits, as `row:column`. */
		const focus = () => {
			const index = rows.findIndex(r => r.jump === document.activeElement || r.diff === document.activeElement);
			return index < 0 ? 'none' : `${index}:${rows[index].diff === document.activeElement ? 'diff' : 'jump'}`;
		};

		rows[0].jump.focus();
		const path = [focus()];
		keydown(list, 'ArrowRight', 39); path.push(focus());
		keydown(list, 'ArrowDown', 40); path.push(focus());  // row 1 has no diff: falls back to the label
		keydown(list, 'ArrowDown', 40); path.push(focus());  // row 2 has one: Down keeps the label column
		keydown(list, 'ArrowRight', 39); path.push(focus());
		keydown(list, 'ArrowLeft', 37); path.push(focus());
		keydown(list, 'Home', 36); path.push(focus());
		keydown(list, 'End', 35); path.push(focus());

		assert.deepStrictEqual({
			path,
			// Exactly one target across the whole flyout stays tabbable, so it is a single Tab stop.
			tabbable: rows.flatMap(r => [r.jump, r.diff]).filter(b => b.tabIndex === 0).length,
		}, {
			path: ['0:jump', '0:diff', '1:jump', '2:jump', '2:diff', '2:jump', '0:jump', '2:jump'],
			tabbable: 1,
		});
	});

	test('activates the focused row target with Enter without letting chat keybindings see it', () => {
		const rail = createRail([tick(0), tick(1, { added: 1, removed: 0, fileCount: 1 })]);
		const rows = rowParts(rail);
		const selected: string[] = [];
		const reviewed: string[] = [];
		const escaped: string[] = [];
		store.add(rail.onDidSelect(id => selected.push(id)));
		store.add(rail.onDidReview(t => reviewed.push(t.requestId)));
		store.add(addDisposableListener(document.body, 'keydown', e => escaped.push(e.key)));

		rows[0].jump.focus();
		keydown(rows[0].jump, 'Enter', 13);
		rows[1].diff.focus();
		keydown(rows[1].diff, 'Enter', 13);

		assert.deepStrictEqual({ selected, reviewed, escaped }, { selected: ['0'], reviewed: ['1'], escaped: [] });
	});

	test('keeps focus in the flyout when a streaming update removes the focused review target', () => {
		const stat = { added: 1, removed: 0, fileCount: 1 };
		const rail = createRail([tick(0, stat)]);
		const rows = rowParts(rail);
		rows[0].diff.focus();

		// The prompt's edits net back to zero mid-stream, so its review target goes away under focus.
		rail.setTicks([tick(0)]);

		assert.deepStrictEqual({
			focused: document.activeElement === rows[0].jump ? 'jump' : document.activeElement === rows[0].diff ? 'diff' : 'lost',
			reviewable: rows[0].row.classList.contains('reviewable'),
			tabbable: [rows[0].jump, rows[0].diff].filter(b => b.tabIndex === 0).length,
		}, {
			focused: 'jump',
			reviewable: false,
			tabbable: 1,
		});
	});

	test('preserves unchanged row content and focus while updating another prompt', () => {
		const stat = { added: 3, removed: 1, fileCount: 1 };
		const ticks = [tick(0, stat), tick(1, stat)];
		const rail = createRail(ticks);
		const rows = rowParts(rail);
		const label = rows[0].jump.firstChild!.firstChild;
		const added = rows[0].diff.querySelector('.added');
		rows[0].diff.focus();

		rail.setTicks(ticks.map(item => ({ ...item, allRequestIds: [...item.allRequestIds], stat: { ...stat } })));
		const unchanged = { label: rows[0].jump.firstChild!.firstChild === label, stat: rows[0].diff.querySelector('.added') === added };
		const updated = { ...ticks[1], text: 'Updated', ariaLabel: 'Updated prompt', stat: { added: 7, removed: 2, fileCount: 2 } };
		rail.setTicks([ticks[0], updated]);
		rail.setActive(ticks[1].requestId);

		assert.deepStrictEqual({
			unchanged,
			firstLabelPreserved: rows[0].jump.firstChild!.firstChild === label,
			firstStatPreserved: rows[0].diff.querySelector('.added') === added,
			focused: document.activeElement === rows[0].diff,
			tabbable: rows.flatMap(row => [row.jump, row.diff]).filter(button => button.tabIndex === 0).length,
			label: rows[1].jump.textContent,
			ariaLabel: rows[1].jump.getAttribute('aria-label'),
			stat: rows[1].diff.textContent,
			active: rows[1].jump.getAttribute('aria-current'),
		}, {
			unchanged: { label: true, stat: true },
			firstLabelPreserved: true,
			firstStatPreserved: true,
			focused: true,
			tabbable: 1,
			label: 'Updated',
			ariaLabel: 'Updated prompt',
			stat: '+7\u22122',
			active: 'location',
		});
	});

	test('keeps review metadata current when only bucket membership or timestamp changes', () => {
		const original = tick(0, { added: 3, removed: 1, fileCount: 1 });
		const rail = createRail([original]);
		const reviewed: PromptTick[] = [];
		store.add(rail.onDidReview(value => reviewed.push(value)));
		const updated = { ...original, allRequestIds: ['0', '1'], count: 2, timestamp: 42 };
		rail.setTicks([updated]);
		rowParts(rail)[0].diff.click();

		assert.deepStrictEqual(reviewed, [updated]);
	});

	test('keeps the flyout above sticky scroll and the transcript scrollbar', () => {
		const host = document.createElement('div');
		host.classList.add('prompt-timeline-host');
		host.style.position = 'fixed';
		host.style.inset = '0 auto auto 0';
		host.style.width = '400px';
		host.style.height = '400px';
		host.style.zIndex = '10000';
		document.body.appendChild(host);
		store.add(toDisposable(() => host.remove()));

		const rail = store.add(new PromptTimelineGutterRail());
		host.appendChild(rail.domNode);
		rail.setTicks(Array.from({ length: 4 }, (_, index) => tick(index)));
		rail.domNode.classList.add('revealed');

		const transcriptChrome = document.createElement('div');
		transcriptChrome.style.position = 'absolute';
		transcriptChrome.style.inset = '0';
		transcriptChrome.style.zIndex = '14';
		host.appendChild(transcriptChrome);

		const panel = rail.domNode.querySelector<HTMLElement>('.prompt-timeline-gutter-panel');
		const firstRow = panel?.querySelector<HTMLElement>('.prompt-timeline-gutter-row-jump');
		assert.ok(panel && firstRow);
		const bounds = firstRow.getBoundingClientRect();
		const topElement = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);

		assert.deepStrictEqual({
			panelReceivesPointer: panel.contains(topElement),
			transcriptChromeReceivesPointer: transcriptChrome.contains(topElement),
		}, {
			panelReceivesPointer: true,
			transcriptChromeReceivesPointer: false,
		});
	});

	test('widens the transcript gutter for the rail, except for a request being edited inline', () => {
		const session = document.createElement('div');
		session.classList.add('interactive-session', 'prompt-timeline-host', 'prompt-timeline-with-gutter');
		session.style.setProperty('--vscode-spacing-size240', '24px');
		document.body.appendChild(session);
		store.add(toDisposable(() => session.remove()));
		const row = (...classes: string[]) => {
			const element = document.createElement('div');
			element.classList.add('interactive-item-container', ...classes);
			session.appendChild(element);
			return getWindow(element).getComputedStyle(element).paddingLeft;
		};

		assert.deepStrictEqual({
			response: row('interactive-response'),
			request: row('interactive-request'),
			editing: row('interactive-request', 'editing'),
		}, {
			response: '24px',
			request: '24px',
			editing: '0px',
		});
	});

	test('places annotations where they happened: a dash between the dots, a row between the prompts, the newest expanded; those after the active prompt accented', () => {
		const rail = createRail([tick(0), tick(10), tick(20)]);
		const rendered: string[] = [];
		const note = (id: string, timestamp: number) => ({
			id, timestamp, label: `note ${id}`,
			renderDetail: (container: HTMLElement) => { rendered.push(id); container.textContent = `detail ${id}`; return toDisposable(() => { }); },
		});
		rail.setAnnotations([note('a', 5), note('b', 25)]);

		const list = Array.from(rail.domNode.querySelectorAll<HTMLElement>('.prompt-timeline-gutter-panel > *')).map((e: HTMLElement) =>
			e.classList.contains('prompt-timeline-gutter-annotation') ? `note:${e.querySelector('.prompt-timeline-gutter-annotation-label')!.textContent}${e.classList.contains('expanded') ? '+' : ''}` : `prompt:${e.querySelector('.prompt-timeline-gutter-row-label')?.textContent}`);
		assert.deepStrictEqual(list, ['prompt:0', 'note:note a', 'prompt:10', 'prompt:20', 'note:note b+']);
		assert.deepStrictEqual(rendered, ['b'], 'only the expanded (newest) note renders its detail');

		const handle = () => Array.from(rail.domNode.querySelector('.prompt-timeline-gutter-rest')!.children).map((e: Element) =>
			e.classList.contains('prompt-timeline-gutter-mark') ? `mark${e.classList.contains('current') ? '!' : ''}` : `dot${e.classList.contains('active') ? '!' : ''}`);
		const currentRows = () => Array.from(rail.domNode.querySelectorAll('.prompt-timeline-gutter-annotation.current')).map(e => e.querySelector('.prompt-timeline-gutter-annotation-label')!.textContent);
		assert.deepStrictEqual(handle(), ['dot', 'mark', 'dot', 'dot', 'mark']);
		rail.setActive('20');
		assert.deepStrictEqual(handle(), ['dot', 'mark', 'dot', 'dot!', 'mark!']);
		assert.deepStrictEqual(currentRows(), ['note b']);
		rail.setActive('0');
		assert.deepStrictEqual(handle(), ['dot!', 'mark!', 'dot', 'dot', 'mark']);
		assert.deepStrictEqual(currentRows(), ['note a']);

		rail.domNode.querySelector<HTMLButtonElement>('.prompt-timeline-gutter-annotation-head')!.click();
		assert.deepStrictEqual(rendered, ['b', 'a']);

		rail.setAnnotations([]);
		assert.strictEqual(rail.domNode.querySelectorAll('.prompt-timeline-gutter-mark, .prompt-timeline-gutter-annotation').length, 0);
	});
});

suite('restDotCount', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Height (px) the drawn column needs: dots (4px) separated by gaps (4px), plus the handle's 8px padding and, when sampled, the 8px marker and its gap. */
	function drawnHeight(dots: number, sampled: boolean): number {
		return 16 + dots * 4 + (dots - 1) * 4 + (sampled ? 12 : 0);
	}

	/** The column must fit the rail with the 12px-per-edge clearance the handle keeps from the transcript. */
	function fits(dots: number, railHeight: number, sampled = true): boolean {
		return drawnHeight(dots, sampled) <= railHeight - 24;
	}

	test('draws one dot per prompt while they fit, sampling only past the fixed cap', () => {
		assert.deepStrictEqual([
			restDotCount(0, 800),
			restDotCount(1, 800),
			restDotCount(12, 800),
			restDotCount(50, 800),
			restDotCount(400, 800),
		], [0, 1, 12, 50, 50]);
	});

	test('samples down to what a short rail can hold, and stays inside it', () => {
		const counts = [restDotCount(40, 200), restDotCount(40, 120), restDotCount(40, 60)];
		assert.deepStrictEqual({
			counts,
			fits: counts.map((dots, i) => fits(dots, [200, 120, 60][i])),
		}, {
			counts: [19, 9, 2],
			// A rail too short for even the two-dot minimum is degenerate; the handle clips there (CSS).
			fits: [true, true, false],
		});
	});

	test('reserves room for the marker when the fixed cap forces sampling', () => {
		// 51 prompts in a 444px rail: all 51 dots would fit on their own, but MAX_REST_DOTS caps them at
		// 50, which makes the trailing marker appear — and 50 dots plus it need 424px of the 420px CSS
		// allows. The count must drop to leave the marker room.
		const dots = restDotCount(51, 444);
		assert.deepStrictEqual({
			dots,
			fits: fits(dots, 444),
			// A rail with room for all 50 plus the marker still draws all 50.
			roomy: restDotCount(51, 448),
		}, {
			dots: 49,
			fits: true,
			roomy: 50,
		});
	});

	test('falls back to the fixed cap when the rail has not been measured yet', () => {
		assert.deepStrictEqual([restDotCount(30, 0), restDotCount(400, 0)], [30, 50]);
	});

});

