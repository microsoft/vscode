/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { SessionChangesFileResourceContext } from './changesMultiDiffSourceResolver.js';
import { ChangesetReviewedFilesContext, ChangesetReviewSupportContext } from './changesViewService.js';
import { CHANGESET_REVIEW_ACTION_ID, SessionChangesEditor } from './sessionChangesEditor.js';

export class ChangesetReviewAction extends Action2 {
	constructor() {
		super({
			id: CHANGESET_REVIEW_ACTION_ID,
			title: localize('changeset.viewed', "Viewed"),
			f1: false,
			toggled: {
				condition: ContextKeyExpr.in(
					SessionChangesFileResourceContext.key,
					ChangesetReviewedFilesContext.key)
			},
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ChangesetReviewSupportContext.isEqualTo(true),
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source')
				),
				group: 'navigation',
				order: 100
			}
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		const changesViewService = accessor.get(IChangesViewService);
		const activeEditorPane = accessor.get(IEditorService).activeEditorPane;

		const reviewedFiles = changesViewService.activeSessionChangesObs.get()
			.filter(change => change.reviewed)
			.map(change => change.modifiedUri?.toString() ?? change.originalUri?.toString())
			.filter((uri: string | undefined) => uri !== undefined);

		const review = !reviewedFiles.includes(resource.toString());

		// Toggle multi-file diff editor item
		if (activeEditorPane instanceof SessionChangesEditor) {
			if (review) {
				activeEditorPane.collapse(resource);
			} else {
				activeEditorPane.expand(resource);
			}
		}

		// Set the review state
		changesViewService.setChangesetFilesReviewState([resource], review);
	}
}

registerAction2(ChangesetReviewAction);
