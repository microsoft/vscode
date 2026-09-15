/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { ChatEditorInput } from '../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';

export class SessionEditorTitle extends Disposable {
	constructor(
		ownerDocument: Document,
		updateVisibleTitle: (title: string) => void,
		@IEditorService editorService: IEditorService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
	) {
		super();
		const activeEditorChanged = observableSignalFromEvent(this, editorService.onDidActiveEditorChange);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			activeEditorChanged.read(reader);
			sessionsChanged.read(reader);
			const editor = editorService.activeEditor;
			if (editor) {
				observableSignalFromEvent(this, editor.onDidChangeLabel).read(reader);
			}
			const resource = editor instanceof ChatEditorInput ? editor.sessionResource ?? editor.resource : editor?.resource;
			const canonical = resource && (chatSessionsService.getMaterializedSessionResource(resource) ?? resource);
			const chat = canonical && sessionsManagementService.getSessionForChatResource(canonical)?.chat;
			const title = chat?.title.read(reader) || editor?.getName() || localize('sessionEditorTitle.empty', "Chat");
			ownerDocument.title = title;
			updateVisibleTitle(title);
		}));
	}
}
