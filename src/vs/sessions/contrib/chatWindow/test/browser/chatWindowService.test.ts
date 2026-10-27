/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, GroupModelChangeKind, IEditorCloseEvent } from '../../../../../workbench/common/editor.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { IEditorGroup, IEmbeddedEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowContext, ChatWindowEditorGroupContext, ChatWindowIdContext, ChatWindowTerminalPositionContext, IChatWindowKind, SessionLayoutModeContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { bindChatWindowContext, chatWindowPartOptions, createChatWindowSessionViewHost, trackEditorAreaEditors } from '../../browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';

suite('Chat window', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('focusing its session focuses the window, and the chat only while it shows, so that a window showing only its editor area keeps it so', () => {
		const focused: string[] = [];
		let chatVisible = true;
		const host = createChatWindowSessionViewHost(() => focused.push('window'), () => focused.push('chat'), () => chatVisible);

		host.focus();
		chatVisible = false;
		host.focus();

		assert.deepStrictEqual(focused, ['window', 'chat', 'window']);
	});

	test('binds its context on its own context key service, which follows its state, and not on the main window\'s', () => {
		const mainContextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const windowContextKeyService = disposables.add(mainContextKeyService.createScoped($('div')));
		const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		const editorGroup = observableValue<IEditorGroup | undefined>('group', { id: 7 } as IEditorGroup);
		disposables.add(bindChatWindowContext(windowContextKeyService, {
			kind, windowId: 42, hasEditorArea: true, state,
			session: observableValue<IActiveSession | undefined>('session', undefined),
			editorGroup,
			editorAreaEditor: observableValue('editor', ''),
		}));
		const read = (service: ContextKeyService | typeof windowContextKeyService) => [ChatWindowContext, ChatWindowIdContext, SessionLayoutModeContext, ChatWindowTerminalPositionContext, ChatWindowEditorGroupContext].map(key => service.getContextKeyValue(key.key));
		const before = read(windowContextKeyService);
		state.setLayout(SessionLayoutMode.Stacked);
		state.setTerminalPosition(SessionTerminalPosition.UnderChat);
		editorGroup.set({ id: 8 } as IEditorGroup, undefined);
		assert.deepStrictEqual({ before, after: read(windowContextKeyService), main: read(mainContextKeyService) }, {
			before: ['test', 42, SessionLayoutMode.SideBySide, SessionTerminalPosition.FullWidth, 7],
			after: ['test', 42, SessionLayoutMode.Stacked, SessionTerminalPosition.UnderChat, 8],
			main: [undefined, undefined, undefined, undefined, undefined],
		});
	});

	test('its editor area shows when an editor opens in it, and closes when its last editor closes, but not for a move or while the window closes', () => {
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		const onDidCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		const onDidAddGroup = disposables.add(new Emitter<IEditorGroup>());
		const onDidRemoveGroup = disposables.add(new Emitter<IEditorGroup>());
		let isEmpty = false;
		let closing = false;
		const group = new class extends mock<IEditorGroup>() {
			override onDidModelChange = onDidModelChange.event;
			override onDidCloseEditor = onDidCloseEditor.event;
			override get isEmpty() { return isEmpty; }
		}();
		const part = new class extends mock<IEmbeddedEditorPart>() {
			override groups = [group];
			override onDidAddGroup = onDidAddGroup.event;
			override onDidRemoveGroup = onDidRemoveGroup.event;
		}();
		const events: string[] = [];
		disposables.add(trackEditorAreaEditors(part, {
			onDidOpenEditor: () => events.push('open'),
			onDidCloseLastEditor: () => events.push('closeLast'),
			isClosing: () => closing,
		}));

		onDidModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN });
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		isEmpty = true;
		onDidCloseEditor.fire({ context: EditorCloseContext.MOVE } as IEditorCloseEvent);
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		closing = true;
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);

		assert.deepStrictEqual(events, ['open', 'closeLast']);
	});

	test('its editor area follows the tabs setting, showing one tab for none so that its actions stay', () => {
		assert.deepStrictEqual([chatWindowPartOptions('multiple'), chatWindowPartOptions('none')], [
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single' },
		]);
	});
});
