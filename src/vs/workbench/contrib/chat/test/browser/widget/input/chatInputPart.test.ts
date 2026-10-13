/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IChatAttachmentWidgetInstance, IChatAttachmentWidgetRegistry } from '../../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { createChatReferenceVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';

suite('ChatInputPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders contributed attachment widgets for the session of the input model that holds the attachments, else the widget session', () => {
		const restoredSession = URI.parse('remote-remote.example__1-copilotcli:/restored');
		const chip = createChatReferenceVariableEntry(URI.parse('ahp-chat://default/c2Vzc2lvbg'), undefined, 'Chat');
		const createdFor: (string | undefined)[] = [];
		// While setInputModel restores the incoming session's attachments, the
		// widget's view model is still absent (first load) or the outgoing session.
		const render = (inputModelSession: URI | undefined, viewModelSession: URI | undefined) => {
			const attachedContextDisposables = store.add(new MutableDisposable());
			const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
				attachedContextContainer: dom.$('div'),
				attachmentsContainer: dom.$('div'),
				attachedContextDisposables,
				_attachmentModel: { attachments: [chip] },
				configurationService: { getValue: () => false },
				options: {},
				_currentLanguageModel: observableValue('model', undefined),
				_indexOfLastAttachedContextDeletedWithKeyboard: -1,
				_indexOfLastOpenedContext: -1,
				_inputModelSessionResource: inputModelSession,
				_widget: viewModelSession && { viewModel: { sessionResource: viewModelSession } },
				_chatAttachmentWidgetRegistry: {
					createWidget: (_attachment, _options, _container, sessionResource): IChatAttachmentWidgetInstance => {
						createdFor.push(sessionResource?.toString());
						return { element: dom.$('div'), onDidDelete: Event.None, onDidOpen: Event.None, dispose: () => { } };
					},
				} satisfies Pick<IChatAttachmentWidgetRegistry, 'createWidget'>,
			}) as ChatInputPart;
			inputPart.renderAttachedContext();
			attachedContextDisposables.dispose();
		};

		const editedRequestSession = URI.parse('agent-host-copilotcli:/edited');
		render(restoredSession, undefined);
		render(restoredSession, URI.parse('agent-host-copilotcli:/outgoing'));
		// The inline request-edit input part never binds an input model.
		render(undefined, editedRequestSession);

		assert.deepStrictEqual(createdFor, [restoredSession.toString(), restoredSession.toString(), editedRequestSession.toString()]);
	});

	test('uses the Sessions content gutter for composer layout', () => {
		const followupsContainer = dom.$('div');
		const editorLayouts: { width: number; height: number }[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { isSessionsWindow: true },
			inputContainer: dom.$('div'),
			followupsContainer,
			_inputEditor: {
				getScrollWidth: () => 100,
				getContentHeight: () => 20,
				layout: (dimension: { width: number; height: number }) => editorLayouts.push(dimension),
			},
			inputEditorMaxHeight: 250,
			inputEditorMinHeight: undefined,
			singleLineInputEditorHeight: 20,
			inputEditorTrailingSpace: 0,
			ignoreInputEditorContentSizeChanges: false,
		}) as ChatInputPart;

		inputPart.layout(800);

		assert.deepStrictEqual({
			followupsWidth: followupsContainer.style.width,
			editorLayouts,
		}, {
			followupsWidth: '752px',
			editorLayouts: [{ width: 740, height: 20 }],
		});
	});
});
