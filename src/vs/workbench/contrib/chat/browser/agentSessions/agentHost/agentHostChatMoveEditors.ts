/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Sequencer } from '../../../../../../base/common/async.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatEditorInput } from '../../widgetHosts/editor/chatEditorInput.js';

/**
 * Keeps showing a chat that moved to another session: each chat editor of its
 * old resource is replaced in place by one of its new resource, which loads the
 * same conversation (including a running turn) from the host.
 */
export async function retargetMovedChatEditors(editorGroupsService: IEditorGroupsService, editorService: IEditorService, from: URI, to: URI): Promise<void> {
	let retargeted = false;
	for (const group of editorGroupsService.groups) {
		const editor = group.editors.find(candidate => candidate instanceof ChatEditorInput && isEqual(candidate.sessionResource, from));
		if (editor) {
			await editorService.replaceEditors([{ editor, replacement: { resource: to, options: { override: ChatEditorInput.EditorID, pinned: true, preserveFocus: true } } }], group);
			retargeted = true;
		}
	}
	if (retargeted) {
		status(localize('agentHost.chatMoved', "Chat moved to another session"));
	}
}

/**
 * Retargets chat editors for one move after another: a chat that moves again (A to B, then B to C) while its editors
 * are still being replaced finds them at B only once the first replacement is done.
 */
export class MovedChatEditorRetargeter {
	private readonly _sequencer = new Sequencer();

	constructor(
		private readonly _editorGroupsService: IEditorGroupsService,
		private readonly _editorService: IEditorService,
	) { }

	retarget(from: URI, to: URI): Promise<void> {
		return this._sequencer.queue(() => retargetMovedChatEditors(this._editorGroupsService, this._editorService, from, to));
	}
}
