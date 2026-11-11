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
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { getChangesOfSession, IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';
import { findChangesEditorFileChange, getChangesEditorFileResource } from '../../../../workbench/contrib/sessionChanges/browser/changesEditorLabels.js';
import { SessionChangesFileResourceContext } from '../../../../workbench/contrib/sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { ChangesetReviewedFilesContext, ChangesetReviewSupportContext, mainWindowChangesOwner } from '../../../../workbench/contrib/sessionChanges/browser/changesViewService.js';
import { CHANGESET_REVIEW_ACTION_ID, getFileActionEditorPane, SessionChangesEditor } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesEditor.js';

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
		// The editor passes its own session; the file toolbar and keybindings fall back to the active one.
		const target = resolveSessionCommandTarget(accessor, [args[1]]);
		const session = target?.session;
		if (!session) {
			return;
		}
		const changes = getChangesOfSession(changesViewService, mainWindowChangesOwner(accessor), session, target.chat);
		if (changes.changesetObs.get()?.capabilities?.review !== true) {
			return;
		}

		// Guard against a resource forwarded by a stale editor row (e.g. mid session switch).
		const change = findChangesEditorFileChange(resource, changes.changesObs.get());
		if (!change) {
			return;
		}

		const activeEditorPane = getFileActionEditorPane(accessor.get(IEditorService), args);
		const fileResource = getChangesEditorFileResource(change);
		const review = !change.reviewed;

		// Toggle multi-file diff editor item
		if (activeEditorPane instanceof SessionChangesEditor) {
			if (review) {
				activeEditorPane.collapse(resource);
			} else {
				activeEditorPane.expand(resource);
			}
		}

		// Set the review state
		changesViewService.setChangesetFilesReviewState([fileResource], review, session, target.chat);
	}
}

registerAction2(ChangesetReviewAction);
