/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { EditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';

suite('EditorWindowSessionsRuntime', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRuntime(state: { readonly views: Set<string>; chatPart: boolean }, events: string[]) {
		const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = disposables.add(new Emitter<{ partId: string; visible: boolean }>());
		const listen = <T>(emitter: Emitter<T>, name: string) => (listener: (e: T) => unknown) => {
			events.push(`listen ${name}`);
			const listening = emitter.event(listener);
			return toDisposable(() => { events.push(`unlisten ${name}`); listening.dispose(); });
		};
		const runtime = disposables.add(new EditorWindowSessionsRuntime(
			upcastPartial<IViewsService>({ onDidChangeViewVisibility: listen(onDidChangeViewVisibility, 'views'), isViewVisible: id => state.views.has(id) }),
			upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: listen(onDidChangePartVisibility, 'parts'), isVisible: part => part === Parts.CHAT_PART && state.chatPart }),
			upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }),
			upcastPartial<IAgentsViewProvidersService>({ acquire: () => { events.push('acquire'); return toDisposable(() => events.push('release')); } }),
		));
		const showView = (id: string, visible: boolean) => {
			if (visible) {
				state.views.add(id);
			} else {
				state.views.delete(id);
			}
			onDidChangeViewVisibility.fire({ id, visible });
		};
		const showChatPart = (visible: boolean) => {
			state.chatPart = visible;
			onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible });
		};
		return { runtime, showView, showChatPart };
	}

	test('listens to nothing and holds nothing until a feature enables it, also while what shows sessions shows', async () => {
		const events: string[] = [];
		const { runtime, showView, showChatPart } = createRuntime({ views: new Set(['list']), chatPart: true }, events);
		showView('list', true);
		showChatPart(true);
		await Promise.resolve();

		assert.deepStrictEqual({ events, enabled: runtime.enabled.get() }, { events: [], enabled: false });
	});

	test('holds the providers while a view of a feature that enabled it, or the chat part, shows, as the window restores too', async () => {
		const events: string[] = [];
		const { runtime, showView, showChatPart } = createRuntime({ views: new Set(), chatPart: true }, events);
		const step = (label: string, action: () => void) => { events.push(`-- ${label}`); action(); };

		// The window restores with the chat part shown
		const list = runtime.enable({ viewIds: ['list'] });
		step('the list shows', () => showView('list', true));
		step('the chat part hides', () => showChatPart(false));
		step('a view of no feature shows', () => showView('other', true));
		step('another feature enables it with its view', () => runtime.enable({ viewIds: ['other'] }).dispose());
		step('the list hides', () => showView('list', false));
		step('the chat part shows', () => showChatPart(true));
		step('the last feature disables it', () => list.dispose());
		step('the list shows', () => showView('list', true));

		assert.deepStrictEqual(events, [
			'listen views', 'listen parts', 'acquire',
			'-- the list shows',
			'-- the chat part hides',
			'-- a view of no feature shows',
			'-- another feature enables it with its view',
			'-- the list hides', 'release',
			'-- the chat part shows', 'acquire',
			'-- the last feature disables it', 'unlisten views', 'unlisten parts', 'release',
			'-- the list shows',
		]);
	});
});
