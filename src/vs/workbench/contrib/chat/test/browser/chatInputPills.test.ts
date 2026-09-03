/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Action } from '../../../../../base/common/actions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatInputPills, createChatInputPillSource, StandardChatInputPillSources, type IStandardChatInputPillsData } from '../../browser/chatInputPills.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind } from '../../common/sessionChatPills.js';

suite('StandardChatInputPillSources', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses one canonical composition for different offered kind sets', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sections = constObservable([]);
		const data: IStandardChatInputPillsData = {
			changes: {
				stats: constObservable({ files: 1, insertions: 2, deletions: 1 }),
				label: constObservable('Changes'),
				open: () => { },
			},
			pullRequests: { sections },
			issues: { sections },
			artifacts: { sections },
			references: { sections },
			customizations: { sections },
			browsers: { sections },
			subagents: { sections },
		};
		const full = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, SESSION_CHAT_PILL_KINDS));
		const editorKinds = [
			SessionChatPillKind.Changes,
			SessionChatPillKind.PullRequests,
			SessionChatPillKind.Issues,
			SessionChatPillKind.Artifacts,
			SessionChatPillKind.References,
			SessionChatPillKind.Browsers,
		];
		const editor = store.add(instantiationService.createInstance(StandardChatInputPillSources, data, editorKinds));

		assert.deepStrictEqual({
			full: full.sources.map(source => source.kind),
			editor: editor.sources.map(source => source.kind),
		}, {
			full: SESSION_CHAT_PILL_KINDS,
			editor: editorKinds,
		});
	});

	test('keeps the row available for restoring a hidden pill', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const hidden = observableValue('hiddenPills', false);
		instantiationService.stub(ISessionChatPillVisibilityService, {
			_serviceBrand: undefined,
			readHiddenKinds: reader => hidden.read(reader) ? new Set([SessionChatPillKind.Browsers]) : new Set(),
			isVisible: (kind, reader) => kind !== SessionChatPillKind.Browsers || !hidden.read(reader),
			hide: () => hidden.set(true, undefined),
			toggle: () => hidden.set(!hidden.get(), undefined),
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const hasData = observableValue('browserPill.hasData', true);
		const source = {
			...createChatInputPillSource({ action: store.add(new Action('browser', 'Browser')) }, SessionChatPillKind.Browsers),
			hasData,
		};
		const overlayFocus = document.createElement('button');
		container.appendChild(overlayFocus);
		let focusFallbackCount = 0;
		const inputPills = store.add(instantiationService.createInstance(ChatInputPills, container, {
			debugName: 'ChatInputPills.test',
			compact: false,
			enabled: constObservable(true),
			sources: constObservable([source]),
			offeredKinds: [SessionChatPillKind.Browsers],
			focusFallback: () => {
				focusFallbackCount++;
				overlayFocus.focus();
			},
		}));
		const before = {
			hidden: inputPills.element.classList.contains('hidden'),
			empty: inputPills.element.classList.contains('empty'),
			pillCount: inputPills.getPillElements().length,
		};

		overlayFocus.focus();
		inputPills.getPillElements()[0].setAttribute('aria-expanded', 'true');
		hidden.set(true, undefined);
		await timeout(0);
		const afterHidden = {
			hidden: inputPills.element.classList.contains('hidden'),
			empty: inputPills.element.classList.contains('empty'),
			pillCount: inputPills.getPillElements().length,
			emptyRowFocused: document.activeElement === inputPills.element.querySelector('.chat-pills-row-content'),
		};
		hasData.set(false, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			before,
			after: afterHidden,
			afterDataRemoved: {
				hidden: inputPills.element.classList.contains('hidden'),
				focusFallbackCount,
				fallbackFocused: document.activeElement === overlayFocus,
			},
		}, {
			before: {
				hidden: false,
				empty: false,
				pillCount: 1,
			},
			after: {
				hidden: false,
				empty: true,
				pillCount: 0,
				emptyRowFocused: true,
			},
			afterDataRemoved: {
				hidden: true,
				focusFallbackCount: 1,
				fallbackFocused: true,
			},
		});
	});
});
