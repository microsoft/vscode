/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INewSessionDraftSlot, INewSessionRequestAcceptedEvent, INewSessionRequestEndedEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { AgentsLauncherPresenter, computeAgentsLauncherBounds, DismissalCheck, dismissWhenAllowed, followOrdinarySend, IAgentsLauncherWindowPresentation } from '../../electron-browser/agentsLauncher.js';

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

	test('positions and clamps the window within its display', () => {
		const bounds = [
			computeAgentsLauncherBounds({ x: 0, y: 0, width: 1440, height: 900 }, 200),
			computeAgentsLauncherBounds({ x: -1920, y: 0, width: 1920, height: 1080 }, 900),
			computeAgentsLauncherBounds({ x: 100, y: 50, width: 600, height: 300 }, 80),
			computeAgentsLauncherBounds({ x: 0, y: 0, width: 40, height: 100 }, 200),
			computeAgentsLauncherBounds({ x: 0, y: 0, width: 1440, height: 900 }, 150, 1.5),
		];

		assert.deepStrictEqual(bounds, [
			{ x: 400, y: 198, width: 640, height: 200 },
			{ x: -1280, y: 238, width: 640, height: 648 },
			{ x: 124, y: 116, width: 552, height: 120 },
			{ x: 20, y: 22, width: 1, height: 60 },
			{ x: 240, y: 198, width: 960, height: 225 },
		]);
	});
});
