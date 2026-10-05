/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICodexContinuationCandidate } from '../../../../../services/agentHost/browser/codexContinuation.js';
import { ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { CodexContinuationPresenter } from '../../../browser/agentSessions/agentHost/codexContinuationPresenter.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

suite('Codex continuation presentation boundary', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	for (const surface of ['agentsWindow', 'editorWindow'] as const) {
		for (const scenario of ['clickBeforeVisible', 'clickDuringClaim', 'dismissDuringClaim', 'rejectedClaim'] as const) {
			test(`${surface} actions await one visibility claim: ${scenario}`, () => runWithFakedTimers({}, async () => {
				const pending = new DeferredPromise<boolean>();
				const candidate = upcastPartial<ICodexContinuationCandidate>({});
				let claims = 0;
				let actions = 0;
				let disposed = 0;
				let visibleSurfaces = 0;
				const nudge = upcastPartial<ICodexContinuationService>({
					candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0), setSelectableModels: () => { },
					wouldShow: async () => true, resolve: async () => candidate, reservePresentation: async () => true,
					releasePresentation: async () => { }, ownsEpisode: () => true,
					markVisible: async (_surface, _candidate, isVisible) => { claims++; return await pending.p && isVisible!(); },
					trackVisibility: () => { visibleSurfaces++; return toDisposable(() => visibleSurfaces--); },
				});
				let visible: () => Promise<boolean>;
				let close: (reason: 'action' | 'dismissed') => void;
				let runAction: (action: () => void) => Promise<void>;
				store.add(new CodexContinuationPresenter({
					surface, onDidChangePresentability: Event.None, isPresentable: () => true,
					show: (_candidate, didShow, didClose, action) => {
						visible = didShow; close = didClose; runAction = action;
						return toDisposable(() => disposed++);
					},
				}, nudge, upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }),
					upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
				await timeout(1);
				if (scenario !== 'clickBeforeVisible') { void visible!(); }
				const action = runAction!(() => actions++);
				const duplicate = runAction!(() => actions++);
				assert.deepStrictEqual({ claims, actions, disposed, visibleSurfaces }, { claims: 1, actions: 0, disposed: 0, visibleSurfaces: 0 });
				if (scenario === 'dismissDuringClaim') { close!('dismissed'); }
				await pending.complete(scenario !== 'rejectedClaim');
				await Promise.all([action, duplicate]);
				assert.deepStrictEqual({ claims, actions, disposed, visibleSurfaces }, {
					claims: 1, actions: scenario === 'clickBeforeVisible' || scenario === 'clickDuringClaim' ? 1 : 0, disposed: 1, visibleSurfaces: 0,
				});
			}));
		}

		test(`${surface} hidden or silenced does not trigger, reserve, or claim`, () => runWithFakedTimers({}, async () => {
			const changed = store.add(new Emitter<void>());
			let presentable = false;
			const calls: string[] = [];
			const candidate = upcastPartial<ICodexContinuationCandidate>({});
			const nudge = upcastPartial<ICodexContinuationService>({
				candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0),
				trackVisibility: () => toDisposable(() => { }),
				setSelectableModels: () => { },
				wouldShow: async () => { calls.push('trigger'); return true; }, resolve: async () => candidate,
				reservePresentation: async () => { calls.push('reserve'); return true; },
				releasePresentation: async () => { }, ownsEpisode: () => true,
				markVisible: async () => { calls.push('visible'); return true; },
			});
			let visible: (() => Promise<boolean>) | undefined;
			const presenter = store.add(new CodexContinuationPresenter({
				surface, onDidChangePresentability: changed.event, isPresentable: () => presentable,
				show: (_candidate, didShow) => { calls.push('create'); visible = didShow; return toDisposable(() => { }); },
			}, nudge, upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }),
				upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
			await timeout(1);
			assert.deepStrictEqual(calls, []);
			presentable = true;
			changed.fire();
			await timeout(1);
			assert.deepStrictEqual(calls, ['trigger', 'reserve', 'create']);
			await visible!();
			await visible!();
			assert.deepStrictEqual(calls, ['trigger', 'reserve', 'create', 'visible']);
			presenter.dispose();
			assert.strictEqual(await visible!(), false);
		}));

		test(`${surface} removes a visible nudge when quota eligibility is lost`, () => runWithFakedTimers({}, async () => {
			const candidate = upcastPartial<ICodexContinuationCandidate>({});
			const eligible = observableValue<ICodexContinuationCandidate | undefined>('candidate', candidate);
			let disposed = 0;
			let dismissed = 0;
			const nudge = upcastPartial<ICodexContinuationService>({
				candidate: eligible, revision: observableValue('revision', 0), setSelectableModels: () => { },
				trackVisibility: () => toDisposable(() => { }),
				wouldShow: async () => true, resolve: async () => eligible.get(), reservePresentation: async () => true,
				releasePresentation: async () => { }, ownsEpisode: () => true, markVisible: async () => true,
				dismiss: () => dismissed++,
			});
			let visible: (() => Promise<boolean>) | undefined;
			store.add(new CodexContinuationPresenter({
				surface, onDidChangePresentability: Event.None, isPresentable: () => true,
				show: (_candidate, didShow) => { visible = didShow; return toDisposable(() => disposed++); },
			}, nudge, upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }),
				upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
			await timeout(1);
			assert.strictEqual(await visible!(), true);

			eligible.set(undefined, undefined);
			await timeout(1);

			assert.deepStrictEqual({ disposed, dismissed }, { disposed: 1, dismissed: 0 });
		}));
	}
	test('disposal while treatment resolves prevents late UI', () => runWithFakedTimers({}, async () => {
		const treatment = new DeferredPromise<boolean>();
		let shown = 0;
		const candidate = upcastPartial<ICodexContinuationCandidate>({});
		const nudge = upcastPartial<ICodexContinuationService>({
			candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0), setSelectableModels: () => { },
			wouldShow: () => treatment.p, resolve: async () => candidate, releasePresentation: async () => { },
		});
		const presenter = store.add(new CodexContinuationPresenter({
			surface: 'editorWindow', onDidChangePresentability: Event.None, isPresentable: () => true,
			show: () => { shown++; return toDisposable(() => { }); },
		}, nudge, upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }),
			upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
		await timeout(1);
		presenter.dispose();
		await treatment.complete(true);
		await timeout(1);
		assert.strictEqual(shown, 0);
	}));

	test('a visibly claimed presentation survives ordinary window blur', () => runWithFakedTimers({}, async () => {
		const focusChanged = store.add(new Emitter<boolean>());
		let hasFocus = true;
		let disposed = 0;
		let dismissed = 0;
		const candidate = upcastPartial<ICodexContinuationCandidate>({});
		const nudge = upcastPartial<ICodexContinuationService>({
			candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0), setSelectableModels: () => { },
			wouldShow: async () => true, resolve: async () => candidate, reservePresentation: async () => true,
			trackVisibility: () => toDisposable(() => { }),
			releasePresentation: async () => { }, ownsEpisode: () => true, markVisible: async () => true,
			dismiss: () => dismissed++,
		});
		let visible: (() => Promise<boolean>) | undefined;
		let close: ((reason: 'action' | 'dismissed') => void) | undefined;
		store.add(new CodexContinuationPresenter({
			surface: 'editorWindow', onDidChangePresentability: Event.None, isPresentable: () => true,
			show: (_candidate, didShow, didClose) => {
				visible = didShow;
				close = didClose;
				return toDisposable(() => disposed++);
			},
		}, nudge, upcastPartial<IHostService>({ get hasFocus() { return hasFocus; }, onDidChangeFocus: focusChanged.event }),
			upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
		await timeout(1);
		assert.strictEqual(await visible!(), true);
		hasFocus = false;
		focusChanged.fire(false);
		await timeout(1);
		assert.deepStrictEqual({ disposed, dismissed }, { disposed: 0, dismissed: 0 });
		close!('dismissed');
		assert.deepStrictEqual({ disposed, dismissed }, { disposed: 1, dismissed: 1 });
	}));

	test('an explicit action closes without recording a passive dismissal', () => runWithFakedTimers({}, async () => {
		let dismissed = 0;
		const candidate = upcastPartial<ICodexContinuationCandidate>({});
		const nudge = upcastPartial<ICodexContinuationService>({
			candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0), setSelectableModels: () => { },
			trackVisibility: () => toDisposable(() => { }),
			wouldShow: async () => true, resolve: async () => candidate, reservePresentation: async () => true,
			releasePresentation: async () => { }, ownsEpisode: () => true, markVisible: async () => true,
			dismiss: () => dismissed++,
		});
		let visible: (() => Promise<boolean>) | undefined;
		let close: ((reason: 'action' | 'dismissed') => void) | undefined;
		store.add(new CodexContinuationPresenter({
			surface: 'agentsWindow', onDidChangePresentability: Event.None, isPresentable: () => true,
			show: (_candidate, didShow, didClose) => {
				visible = didShow;
				close = didClose;
				return toDisposable(() => { });
			},
		}, nudge, upcastPartial<IHostService>({ hasFocus: true, onDidChangeFocus: Event.None }),
			upcastPartial<ILanguageModelsService>({ getLanguageModelIds: () => [], onDidChangeLanguageModels: Event.None })));
		await timeout(1);
		assert.strictEqual(await visible!(), true);
		close!('action');
		assert.strictEqual(dismissed, 0);
	}));
});
