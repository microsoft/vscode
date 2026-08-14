/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { AbstractChatResponseFileChangesService, IChatResponseFileChangesOpenContext } from './chatResponseFileChangesService.js';

export class EditorChatResponseFileChangesService extends AbstractChatResponseFileChangesService {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
	}

	override openChangesForRequest(sessionResource: URI, requestId: string | undefined, _context: IChatResponseFileChangesOpenContext): void {
		if (requestId === undefined) {
			return;
		}
		const diffs = this.getChangesForRequest(sessionResource, requestId)?.get();
		if (!diffs?.length) {
			return;
		}
		const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
		this.editorService.openEditor({
			multiDiffSource: source,
			label: localize('chatTurnPills.changes.title', "Turn File Changes"),
			resources: diffs.map(diff => ({
				original: { resource: diff.originalURI },
				modified: { resource: diff.isDeleted ? undefined : diff.modifiedURI },
			})),
		});
	}
}
