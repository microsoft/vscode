/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { scheduleAtNextAnimationFrame } from '../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IEditorOpenContext } from '../../../../../../common/editor.js';
import { IEditorGroup } from '../../../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { AgentHostSessionInputPills } from '../../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { ChatWidget } from '../../../../browser/widget/chatWidget.js';
import { ChatEditor } from '../../../../browser/widgetHosts/editor/chatEditor.js';
import { ChatEditorInput, ChatEditorModel } from '../../../../browser/widgetHosts/editor/chatEditorInput.js';
import { IChatSessionsService, localChatSessionType } from '../../../../common/chatSessionsService.js';

suite('ChatEditor loading feedback', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	for (const scenario of [
		{ name: 'ordinary local restores retain their existing presentation', type: localChatSessionType, options: undefined, loading: false },
		{ name: 'local restores can opt into immediate Loading', type: localChatSessionType, options: { showLoading: true }, loading: true },
		{ name: 'contributed sessions retain immediate Loading', type: 'test-loading', options: undefined, loading: true },
	]) {
		test(scenario.name, async () => {
			const instantiation = workbenchInstantiationService(undefined, store);
			instantiation.stubInstance(ChatWidget, {
				onDidSubmitAgent: Event.None, onDidChangeViewModel: Event.None,
				render() { }, setVisible() { }, getInput: () => '', setModel() { },
				unlockFromCodingAgent() { }, getViewState: () => ({ scrollTop: 0 }), dispose() { },
			});
			instantiation.stubInstance(AgentHostSessionInputPills, { dispose() { } });
			instantiation.stub(IChatSessionsService, { canResolveChatSession: async () => true, getAllChatSessionContributions: () => [] });
			const group = new class extends mock<IEditorGroup>() {
				override readonly id = 1;
				override readonly windowId = mainWindow.vscodeWindowId;
				override readonly onWillCloseEditor = Event.None;
			}();
			const editor = store.add(instantiation.createInstance(ChatEditor, group));
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			store.add(toDisposable(() => container.remove()));
			editor.create(container);
			const input = store.add(instantiation.createInstance(ChatEditorInput, URI.parse('test-loading:/session'), {}));
			sinon.stub(input, 'getSessionType').returns(scenario.type);
			const resolved = new DeferredPromise<ChatEditorModel | null>();
			const resolveInput = sinon.stub(input, 'resolve').returns(resolved.p);
			const opening = editor.setInput(input, scenario.options, new class extends mock<IEditorOpenContext>() { }(), CancellationToken.None);
			if (scenario.options?.showLoading && mainWindow.document.visibilityState === 'visible') {
				const firstFrame = new DeferredPromise<boolean>();
				store.add(scheduleAtNextAnimationFrame(mainWindow, () => { void firstFrame.complete(resolveInput.called); }));
				assert.strictEqual(await firstFrame.p, false, 'Allow loading feedback a frame before beginning model resolution');
			}
			await timeout(0);
			assert.deepStrictEqual({
				message: container.querySelector('.chat-loading-content span:not(.codicon)')?.textContent,
				busy: container.getAttribute('aria-busy'),
			}, { message: scenario.loading ? 'Loading...' : undefined, busy: scenario.loading ? 'true' : null });
			await resolved.complete(null);
			await assert.rejects(opening);
			assert.deepStrictEqual({ overlay: container.querySelector('.chat-loading-overlay'), busy: container.getAttribute('aria-busy') }, { overlay: null, busy: null });
		});
	}
});
