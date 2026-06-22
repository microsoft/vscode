/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISpotlightContent, SpotlightOverlay } from '../../browser/spotlight/spotlightOverlay.js';

/** Minimal fake ResizeObserver so the widget can be tested without real layout churn. */
class FakeResizeObserver implements ResizeObserver {
	readonly observed: Element[] = [];
	constructor(private readonly _callback: ResizeObserverCallback) { }
	observe(target: Element): void { this.observed.push(target); }
	unobserve(): void { }
	disconnect(): void { }
	trigger(): void { this._callback([], this); }
}

suite('SpotlightOverlay', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContainer(): HTMLElement {
		const container = $('div.test-spotlight-container');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		return container;
	}

	function createTarget(container: HTMLElement, left: number, top: number, width: number, height: number): HTMLElement {
		const target = $('div.test-spotlight-target');
		target.style.position = 'fixed';
		target.style.left = `${left}px`;
		target.style.top = `${top}px`;
		target.style.width = `${width}px`;
		target.style.height = `${height}px`;
		container.appendChild(target);
		return target;
	}

	function content(overrides: Partial<ISpotlightContent> = {}): ISpotlightContent {
		return {
			title: 'My Title',
			description: 'My description',
			stepIndex: 1,
			stepCount: 3,
			canGoBack: true,
			isLastStep: false,
			...overrides
		};
	}

	function getButtons(container: HTMLElement): HTMLElement[] {
		return Array.from(container.getElementsByClassName('monaco-button')) as HTMLElement[];
	}

	test('show renders content and positions the hole around the target (+padding)', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 50, 200, 40);

		overlay.show(target, content());

		const root = container.getElementsByClassName('spotlight-overlay')[0] as HTMLElement;
		const hole = container.getElementsByClassName('spotlight-hole')[0] as HTMLElement;

		assert.deepStrictEqual({
			visible: root.style.display !== 'none',
			title: container.getElementsByClassName('spotlight-callout-title')[0].textContent,
			description: container.getElementsByClassName('spotlight-callout-description')[0].textContent,
			counter: container.getElementsByClassName('spotlight-callout-counter')[0].textContent,
			holeLeft: hole.style.left,
			holeTop: hole.style.top,
			holeWidth: hole.style.width,
			holeHeight: hole.style.height,
		}, {
			visible: true,
			title: 'My Title',
			description: 'My description',
			counter: '2 of 3',
			holeLeft: '94px',
			holeTop: '44px',
			holeWidth: '212px',
			holeHeight: '52px',
		});
	});

	test('Next / Back / Skip buttons fire the corresponding events', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		const fired: string[] = [];
		disposables.add(overlay.onDidSkip(() => fired.push('skip')));
		disposables.add(overlay.onDidClickPrevious(() => fired.push('back')));
		disposables.add(overlay.onDidClickNext(() => fired.push('next')));

		overlay.show(target, content());

		// Buttons are appended in order: Skip, Back, Next.
		const [skip, back, next] = getButtons(container);
		skip.click();
		back.click();
		next.click();

		assert.deepStrictEqual(fired, ['skip', 'back', 'next']);
	});

	test('advanceOnTargetClick hides Next and advances when the target is clicked', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);

		let advanced = 0;
		disposables.add(overlay.onDidClickNext(() => advanced++));

		overlay.show(target, content(), { advanceOnTargetClick: true });

		const [, , next] = getButtons(container);
		const blocker = container.getElementsByClassName('spotlight-blocker')[0] as HTMLElement;
		target.click();

		assert.deepStrictEqual({
			nextHidden: next.style.display === 'none',
			interactive: blocker.style.clipPath.includes('evenodd'),
			advanced
		}, { nextHidden: true, interactive: true, advanced: 1 });
	});

	test('Back button is hidden when canGoBack is false and Next becomes Done on the last step', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content({ canGoBack: false, isLastStep: true }));

		const [, back, next] = getButtons(container);
		assert.deepStrictEqual({ backHidden: back.style.display === 'none', nextLabel: next.textContent }, { backHidden: true, nextLabel: 'Done' });
	});

	test('allowTargetInteraction cuts a hole out of the click blocker', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 100, 100, 80, 30);
		const blocker = () => container.getElementsByClassName('spotlight-blocker')[0] as HTMLElement;

		overlay.show(target, content(), { allowTargetInteraction: false });
		assert.strictEqual(blocker().style.clipPath, '');

		overlay.show(target, content(), { allowTargetInteraction: true });
		assert.ok(blocker().style.clipPath.includes('evenodd'), 'expected an evenodd clip-path');
	});

	test('observes the target and container for re-layout', () => {
		const container = createContainer();
		const observers: FakeResizeObserver[] = [];
		const ctor = class extends FakeResizeObserver {
			constructor(cb: ResizeObserverCallback) { super(cb); observers.push(this); }
		};
		const overlay = disposables.add(new SpotlightOverlay(container, ctor as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content());

		assert.deepStrictEqual(observers.length === 1 ? observers[0].observed.includes(target) && observers[0].observed.includes(container) : false, true);
	});

	test('focus trap includes links rendered in a markdown description', () => {
		const container = createContainer();
		const overlay = disposables.add(new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver));
		const target = createTarget(container, 0, 0, 50, 50);

		overlay.show(target, content({ description: new MarkdownString('See [the docs](https://example.com) for more.') }));

		const callout = container.getElementsByClassName('spotlight-callout')[0] as HTMLElement;
		const link = callout.getElementsByTagName('a')[0] as HTMLAnchorElement | undefined;
		assert.ok(link, 'expected a link to be rendered from the markdown description');

		// With the link focused, Shift+Tab should cycle to the last button (Next),
		// proving the link participates in the trap rather than being skipped.
		link!.focus();
		callout.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 9 /* Tab */, shiftKey: true, bubbles: true, cancelable: true } as KeyboardEventInit));

		assert.strictEqual(mainWindow.document.activeElement, getButtons(container).at(-1));
	});

	test('dispose removes the overlay from the DOM', () => {
		const container = createContainer();
		const overlay = new SpotlightOverlay(container, FakeResizeObserver as unknown as typeof ResizeObserver);
		const target = createTarget(container, 0, 0, 50, 50);
		overlay.show(target, content());

		overlay.dispose();

		assert.strictEqual(container.getElementsByClassName('spotlight-overlay').length, 0);
	});
});
