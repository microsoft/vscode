/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INewSessionDraftSlot, INewSessionRequestAcceptedEvent, INewSessionRequestEndedEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { IRectangle } from '../../../../../platform/window/common/window.js';
import { AgentsLauncherClickThrough, AgentsLauncherPresenter, computeAgentsLauncherLayout, DismissalCheck, dismissWhenAllowed, followOrdinarySend, IAgentsLauncherWindowPresentation } from '../../electron-browser/agentsLauncher.js';

/** Records the window operations of a presenter, any of which a test can hold until it completes them. */
class RecordingPresentation implements IAgentsLauncherWindowPresentation {
	readonly operations: string[] = [];
	readonly held = new Map<string, { entered: DeferredPromise<void>; release: DeferredPromise<void> }>();
	windowId: number | undefined;
	/** The operation that fails, if any. */
	failing: string | undefined;
	/** Whether the window cannot show, such as while Chat is disabled. */
	unavailable = false;

	/** Holds the next operation `name` until the returned promise's `release` completes. */
	hold(name: string) {
		const held = { entered: new DeferredPromise<void>(), release: new DeferredPromise<void>() };
		this.held.set(name, held);
		return held;
	}

	getWindowId(): number | undefined {
		return this.windowId;
	}

	async prepare(): Promise<number | undefined> {
		await this._record('prepare');
		if (this.unavailable) {
			return undefined;
		}
		this.windowId = 1;
		return this.windowId;
	}

	setOpacity(_windowId: number, opacity: number): Promise<void> {
		return this._record(`opacity ${opacity}`);
	}

	position(): Promise<void> {
		return this._record('position');
	}

	show(): Promise<void> {
		return this._record('show');
	}

	focus(): void {
		this.operations.push('focus');
	}

	whenRendered(): Promise<void> {
		return this._record('rendered');
	}

	hide(): Promise<void> {
		return this._record('hide');
	}

	private async _record(name: string): Promise<void> {
		this.operations.push(name);
		const held = this.held.get(name);
		if (held) {
			this.held.delete(name);
			held.entered.complete();
			await held.release.p;
		}
		if (name === this.failing) {
			throw new Error(`${name} failed`);
		}
	}
}

suite('Agents Launcher', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const shown = ['opacity 0', 'position', 'show', 'focus', 'rendered', 'opacity 1'];

	test('toggles the window, hides it should a show fail, and shows none it cannot show', async () => {
		const presentation = new RecordingPresentation();
		const presenter = new AgentsLauncherPresenter(presentation);
		await presenter.toggle();
		await presenter.toggle();
		presentation.failing = 'show';
		const failure = await presenter.show().then(() => undefined, (error: Error) => error.message);
		const visibleAfterFailure = presenter.visible.get();
		presentation.failing = undefined;
		presentation.unavailable = true;
		await presenter.show();

		assert.deepStrictEqual({ visibleAfterFailure, failure, visible: presenter.visible.get(), operations: presentation.operations }, {
			visibleAfterFailure: false,
			failure: 'show failed',
			visible: false,
			operations: ['prepare', ...shown, 'hide', 'prepare', 'opacity 0', 'position', 'show', 'hide', 'prepare'],
		});
	});

	test('a show requested while an earlier one creates the window presents it', async () => {
		const presentation = new RecordingPresentation();
		const presenter = new AgentsLauncherPresenter(presentation);
		const prepare = presentation.hold('prepare');

		const first = presenter.show();
		await prepare.entered.p;
		await presenter.hide();
		await presenter.show();
		prepare.release.complete();
		await first;

		assert.deepStrictEqual({ visible: presenter.visible.get(), operations: presentation.operations }, {
			visible: true,
			operations: ['prepare', 'prepare', ...shown],
		});
	});

	test('leaves for the Agents window as an ordinary send goes out, and opens its session once it has started, but not one that failed or did not go out', () => {
		const accepted = store.add(new Emitter<INewSessionRequestAcceptedEvent>());
		const ended = store.add(new Emitter<INewSessionRequestEndedEvent>());
		const replaced = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const service = upcastPartial<ISessionsManagementService>({ onDidAcceptNewSessionRequest: accepted.event, onDidEndNewSessionRequest: ended.event, onDidReplaceNewDraftSession: replaced.event, onDidReplaceSession: Event.None });
		const slot = upcastPartial<INewSessionDraftSlot>({ id: 'agentsLauncher' });
		const otherSlot = upcastPartial<INewSessionDraftSlot>({ id: 'other' });
		const session = (sessionId: string) => upcastPartial<ISession>({ sessionId });
		const follow = (scenario: (draft: ISession, following: IDisposable) => void) => {
			const events: string[] = [];
			const draft = session('draft');
			const following = followOrdinarySend(service, slot, draft, { leave: () => events.push('leave'), open: started => events.push(`open ${started.sessionId}`) });
			scenario(draft, following);
			following.dispose();
			return events;
		};

		assert.deepStrictEqual({
			started: follow(draft => {
				accepted.fire({ session: draft, owner: otherSlot, background: true });
				accepted.fire({ session: session('other'), owner: slot, background: true });
				accepted.fire({ session: draft, owner: slot, background: true });
				replaced.fire({ from: draft, to: session('prepared') });
				ended.fire({ session: session('prepared'), owner: otherSlot, started: true, readopted: false });
				ended.fire({ session: session('prepared'), owner: slot, started: true, readopted: false });
			}),
			failed: follow(draft => {
				accepted.fire({ session: draft, owner: slot, background: true });
				ended.fire({ session: draft, owner: slot, started: false, readopted: false, error: new Error('failed') });
			}),
			notSent: follow((draft, following) => {
				following.dispose();
				accepted.fire({ session: draft, owner: slot, background: true });
				ended.fire({ session: draft, owner: slot, started: true, readopted: false });
			}),
		}, {
			started: ['leave', 'open prepared'],
			failed: ['leave'],
			notSent: [],
		});
	});

	test('a hide while showing leaves the window hidden', async () => {
		const presentation = new RecordingPresentation();
		const presenter = new AgentsLauncherPresenter(presentation);
		const position = presentation.hold('position');

		const show = presenter.show();
		await position.entered.p;
		await presenter.hide();
		position.release.complete();
		await show;

		assert.deepStrictEqual({ visible: presenter.visible.get(), operations: presentation.operations }, {
			visible: false,
			operations: ['prepare', 'opacity 0', 'position', 'hide', 'hide'],
		});
	});

	test('a hide while creating the window hides it once created', async () => {
		const presentation = new RecordingPresentation();
		const presenter = new AgentsLauncherPresenter(presentation);
		const prepare = presentation.hold('prepare');

		const show = presenter.show();
		await prepare.entered.p;
		await presenter.hide();
		prepare.release.complete();
		await show;

		assert.deepStrictEqual({ visible: presenter.visible.get(), operations: presentation.operations }, {
			visible: false,
			operations: ['prepare', 'hide'],
		});
	});

	test('hides once it has left the launcher, checking again while a send or popup defers it, until it is kept', () => runWithFakedTimers({}, async () => {
		const run = async (checks: DismissalCheck[], disposeAfter?: number) => {
			const results = [...checks];
			let checked = 0, dismissed = 0;
			const dismissal = dismissWhenAllowed(() => { checked++; return results.shift() ?? DismissalCheck.Defer; }, 150, () => dismissed++);
			await timeout(disposeAfter ?? 150 * (checks.length + 2));
			dismissal.dispose();
			await timeout(1000);
			return { checked, dismissed };
		};

		assert.deepStrictEqual({
			dismissed: await run([DismissalCheck.Dismiss]),
			deferred: await run([DismissalCheck.Defer, DismissalCheck.Defer, DismissalCheck.Dismiss]),
			kept: await run([DismissalCheck.Defer, DismissalCheck.Keep]),
			disposedWhileDeferred: await run([DismissalCheck.Defer, DismissalCheck.Defer, DismissalCheck.Dismiss], 400),
		}, {
			dismissed: { checked: 1, dismissed: 1 },
			deferred: { checked: 3, dismissed: 1 },
			kept: { checked: 2, dismissed: 0 },
			disposedWhileDeferred: { checked: 2, dismissed: 0 },
		});
	}));

	test('lets clicks through where the window renders nothing, checking again as a drag ends and as a popup opens or closes beneath a pointer at rest', async () => {
		const place = (element: HTMLElement, x: number, y: number, width: number, height: number) => {
			element.style.cssText = `position: absolute; left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;
			return element;
		};
		const container = place(dom.$('.container'), 0, 0, 300, 300);
		container.style.position = 'fixed';
		container.style.zIndex = '100000';
		const card = container.appendChild(place(dom.$('.card'), 10, 10, 100, 50));
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const events: string[] = [];
		const scheduled: (() => void)[] = [];
		const clickThrough = store.add(new AgentsLauncherClickThrough(container, card, ignore => events.push(ignore ? 'through' : 'capture'), () => events.push('background click'), check => {
			scheduled.push(check);
			return toDisposable(() => {
				const index = scheduled.indexOf(check);
				if (index >= 0) {
					scheduled.splice(index, 1);
				}
			});
		}));
		const flush = async () => {
			await timeout(0);
			for (const check of scheduled.splice(0)) {
				check();
			}
		};
		const mouse = (type: string, x: number, y: number, buttons = 0) => {
			(mainWindow.document.elementFromPoint(x, y) ?? container).dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons }));
		};

		clickThrough.resetPointer({ x: 50, y: 30 });
		mouse('mousemove', 200, 250);
		const popup = container.appendChild(place(dom.$('.popup'), 150, 200, 100, 100));
		await flush();
		popup.remove();
		await flush();
		mouse('mousemove', 50, 30);
		mouse('mousedown', 50, 30, 1);
		mouse('mousemove', 200, 250, 1);
		mouse('mouseup', 200, 250);
		events.push('|');
		const block = container.appendChild(place(dom.$('.context-view-block'), 0, 0, 300, 300));
		await flush();
		mouse('mousemove', 50, 30);
		mouse('mousemove', 200, 250);
		mouse('mousedown', 200, 250, 1);
		events.push('|');
		clickThrough.resetPointer(undefined);
		block.remove();
		container.appendChild(popup);
		await flush();

		assert.deepStrictEqual(events, [
			// Over the card as it shows, then the background, a popup opened and closed beneath the resting pointer, and a drag out of the card.
			'capture', 'through', 'capture', 'through', 'capture', 'through', '|',
			// A menu's block is content over the card only, and a click outside the card that the window still receives goes through.
			'capture', 'through', 'background click', '|',
			// Nothing checks while the pointer is not known to be over the window.
		]);
	});

	test('looks within shadow roots and checks again as content animates, or the window changes beneath a pointer at rest', async () => {
		const place = (element: HTMLElement, x: number, y: number, width: number | string, height: number) => {
			element.style.cssText = `position: absolute; left: ${x}px; top: ${y}px; width: ${typeof width === 'number' ? `${width}px` : width}; height: ${height}px;`;
			return element;
		};
		const container = place(dom.$('.container'), 0, 0, 300, 300);
		container.style.position = 'fixed';
		container.style.zIndex = '100000';
		const card = container.appendChild(place(dom.$('.card'), 10, 10, 100, 50));
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(toDisposable(() => mainWindow.document.documentElement.style.removeProperty('--agents-launcher-test-width')));

		const events: string[] = [];
		const scheduled: (() => void)[] = [];
		const clickThrough = store.add(new AgentsLauncherClickThrough(container, card, ignore => events.push(ignore ? 'through' : 'capture'), () => events.push('background click'), check => {
			scheduled.push(check);
			return toDisposable(() => {
				const index = scheduled.indexOf(check);
				if (index >= 0) {
					scheduled.splice(index, 1);
				}
			});
		}));
		const flush = async () => {
			await timeout(0);
			for (const check of scheduled.splice(0)) {
				check();
			}
		};
		// Dispatched to the innermost element at the point, through shadow roots, as the browser does.
		const mouse = (type: string, x: number, y: number) => {
			let target = mainWindow.document.elementFromPoint(x, y) ?? container;
			for (let inner = target.shadowRoot?.elementFromPoint(x, y); inner && inner !== target; inner = target.shadowRoot?.elementFromPoint(x, y)) {
				target = inner;
			}
			target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y }));
		};

		// A menu that renders into a shadow root, with the block behind it that covers the whole window.
		const host = container.appendChild(place(dom.$('.shadow-host'), 0, 0, 300, 300));
		const shadowRoot = host.attachShadow({ mode: 'open' });
		shadowRoot.appendChild(place(dom.$('.context-view-block'), 0, 0, 300, 300));
		shadowRoot.appendChild(place(dom.$('.menu'), 150, 10, 100, 50));
		clickThrough.resetPointer({ x: 50, y: 30 });
		mouse('mousemove', 200, 250);
		mouse('mousemove', 200, 30);
		mouse('mousedown', 200, 250);
		events.push('|');
		// A submenu opened with the keyboard beneath the resting pointer, then closed, within the shadow root its host keeps.
		const submenu = shadowRoot.appendChild(place(dom.$('.submenu'), 180, 230, 60, 60));
		await flush();
		submenu.style.display = 'none';
		await flush();
		events.push('|');
		host.remove();
		await flush();

		// A popup that grows beneath the resting pointer as it opens, without changing the DOM, as a CSS animation does.
		mainWindow.document.documentElement.style.setProperty('--agents-launcher-test-width', '20px');
		const popup = container.appendChild(place(dom.$('.popup'), 150, 200, 'var(--agents-launcher-test-width)', 100));
		await flush();
		mainWindow.document.documentElement.style.setProperty('--agents-launcher-test-width', '100px');
		await flush();
		events.push('animated');
		popup.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }));
		await flush();
		events.push('|');
		popup.remove();
		await flush();

		// The window's zoom changes beneath the resting pointer, which is now over the card, but not as of a location sampled before it moved.
		clickThrough.relocatePointer({ x: 60, y: 40 }, clickThrough.pointerVersion);
		const sampled = clickThrough.pointerVersion;
		mouse('mousemove', 200, 250);
		clickThrough.relocatePointer({ x: 60, y: 40 }, sampled);

		assert.deepStrictEqual(events, [
			// Over the card as it shows, the shadow-hosted block outside the card, the menu, and a click on the block outside the card.
			'capture', 'through', 'capture', 'through', 'background click', '|',
			// The submenu opened and closed beneath the pointer within the shadow root.
			'capture', 'through', '|',
			// The popup grown beneath the pointer without changing the DOM, checked once its animation ends.
			'animated', 'capture', '|',
			// Closing the popup, the pointer over the card once the window's zoom changed, and moved off it, which the older sample does not undo.
			'through', 'capture', 'through',
		]);
	});

	test('lays out the card within its display, and a transparent window around it spanning the height of the work area', () => {
		const menuBarAndDock = { x: 0, y: 25, width: 1440, height: 800 };
		const layout = (display: IRectangle, workArea: IRectangle, contentHeight: number, zoomFactor = 1) => computeAgentsLauncherLayout(display, workArea, contentHeight, zoomFactor, true);
		const layouts = [
			layout({ x: 0, y: 0, width: 1440, height: 900 }, menuBarAndDock, 200),
			layout({ x: -1920, y: 0, width: 1920, height: 1080 }, { x: -1920, y: 0, width: 1920, height: 1080 }, 900),
			layout({ x: 100, y: 50, width: 600, height: 300 }, { x: 100, y: 75, width: 600, height: 275 }, 80),
			layout({ x: 0, y: 0, width: 40, height: 100 }, { x: 0, y: 0, width: 40, height: 100 }, 200),
			layout({ x: 0, y: 0, width: 1440, height: 900 }, menuBarAndDock, 150, 1.5),
			// A dock on the left that the card reaches into.
			layout({ x: 0, y: 0, width: 800, height: 600 }, { x: 120, y: 25, width: 680, height: 575 }, 100),
		];
		const opaque = computeAgentsLauncherLayout({ x: 0, y: 0, width: 1440, height: 900 }, menuBarAndDock, 200, 1, false);

		assert.deepStrictEqual({ cards: layouts.map(({ card }) => card), windows: layouts.map(({ window }) => window), opaque }, {
			cards: [
				{ x: 400, y: 198, width: 640, height: 200 },
				{ x: -1280, y: 238, width: 640, height: 648 },
				{ x: 124, y: 116, width: 552, height: 120 },
				{ x: 20, y: 22, width: 1, height: 60 },
				{ x: 240, y: 198, width: 960, height: 225 },
				{ x: 80, y: 132, width: 640, height: 120 },
			],
			windows: [
				{ x: 376, y: 25, width: 688, height: 800 },
				{ x: -1304, y: 0, width: 688, height: 1080 },
				{ x: 100, y: 75, width: 600, height: 275 },
				{ x: 0, y: 0, width: 40, height: 100 },
				{ x: 204, y: 25, width: 1032, height: 800 },
				{ x: 80, y: 25, width: 664, height: 575 },
			],
			// An opaque window is the card.
			opaque: { window: { x: 400, y: 198, width: 640, height: 200 }, card: { x: 400, y: 198, width: 640, height: 200 } },
		});
	});
});
