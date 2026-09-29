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
		test(`${surface} hidden or silenced does not trigger, reserve, or claim`, () => runWithFakedTimers({}, async () => {
			const changed = store.add(new Emitter<void>());
			let presentable = false;
			const calls: string[] = [];
			const candidate = upcastPartial<ICodexContinuationCandidate>({});
			const nudge = upcastPartial<ICodexContinuationService>({
				candidate: observableValue('candidate', candidate), revision: observableValue('revision', 0),
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
});
