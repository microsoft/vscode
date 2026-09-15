/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChat, ISession } from '../../../sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { SessionEditorTitle } from '../../browser/sessionEditorTitle.js';

suite('SessionEditorTitle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('matches full board chat titles, observes renames and stops after disposal', () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		const activeEditorChanged = store.add(new Emitter<void>());
		const labelChanged = store.add(new Emitter<void>());
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const resource = URI.parse('test-chat:/chat');
		const chatTitle = observableValue('title', 'The full title displayed on the project board, without truncation');
		const editor = new class extends mock<EditorInput>() {
			override readonly typeId = 'test.editor';
			override readonly resource = resource;
			override readonly onDidChangeLabel = labelChanged.event;
			override getName() { return 'Stale editor title'; }
		}();
		let visible = '';
		const title = store.add(new SessionEditorTitle(
			document,
			value => visible = value,
			new class extends mock<IEditorService>() {
				override readonly activeEditor = editor;
				override readonly onDidActiveEditorChange = activeEditorChanged.event;
			}(),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override getSessionForChatResource(candidate: URI) {
					assert.strictEqual(candidate.toString(), resource.toString());
					return { session: new class extends mock<ISession>() { }(), chat: new class extends mock<IChat>() {
						override readonly title = chatTitle;
					}() };
				}
			}(),
			new class extends mock<IChatSessionsService>() {
				override getMaterializedSessionResource() { return undefined; }
			}(),
		));
		assert.deepStrictEqual({ native: document.title, visible }, { native: chatTitle.get(), visible: chatTitle.get() });
		chatTitle.set('Renamed chat', undefined);
		assert.deepStrictEqual({ native: document.title, visible }, { native: 'Renamed chat', visible: 'Renamed chat' });
		title.dispose();
		chatTitle.set('Changed after close', undefined);
		assert.strictEqual(document.title, 'Renamed chat');
	});

	test('restored drafts adopt the published chat title and follow editor label changes', () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		const changed = store.add(new Emitter<ISessionsChangeEvent>());
		const labels = store.add(new Emitter<void>());
		const draft = URI.parse('test-chat:/draft');
		const published = URI.parse('test-chat:/published');
		const state: { materialized: URI | undefined } = { materialized: undefined };
		let fallback = 'New Session';
		const title = observableValue('publishedTitle', 'Published board title');
		const editorService = new class extends mock<IEditorService>() {
			override readonly activeEditor = new class extends mock<EditorInput>() {
				override readonly typeId = 'test.editor';
				override readonly resource = draft;
				override readonly onDidChangeLabel = labels.event;
				override getName() { return fallback; }
			}();
			override readonly onDidActiveEditorChange = Event.None;
		}();
		const sessions = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = changed.event;
			override getSessionForChatResource(resource: URI) {
				return resource.toString() === published.toString() ? {
					session: new class extends mock<ISession>() { }(),
					chat: new class extends mock<IChat>() { override readonly title = title; }(),
				} : undefined;
			}
		}();
		const chatSessions = new class extends mock<IChatSessionsService>() {
			override getMaterializedSessionResource() { return state.materialized; }
		}();
		const controller = store.add(new SessionEditorTitle(document, () => { }, editorService, sessions, chatSessions));
		assert.strictEqual(document.title, 'New Session');
		fallback = 'First generated title';
		labels.fire();
		assert.strictEqual(document.title, fallback);
		state.materialized = published;
		changed.fire({ added: [], removed: [], changed: [] });
		assert.strictEqual(document.title, 'Published board title');
		controller.dispose();
		store.add(new SessionEditorTitle(document, () => { }, editorService, sessions, chatSessions));
		assert.strictEqual(document.title, 'Published board title');
	});
});
