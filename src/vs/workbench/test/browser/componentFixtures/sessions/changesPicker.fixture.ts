/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IChangesEditorScope, IChangesViewService, NoChangesEditorScope } from '../../../../contrib/sessions/common/changesViewService.js';
import { ChangesPickerActionItem, ChangesPickerSummary } from '../../../../contrib/sessionChanges/browser/changesView.js';
import '../../../../contrib/sessionChanges/browser/media/sessionChangesEditor.css';
import { BRANCH_CHANGES_CHANGESET_ID, ISessionChangeset, ISessionChangesetBaseBranchSelection, ISessionChangesSummary } from '../../../../services/sessions/common/session.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

/** Renders the changeset picker of Branch Changes compared against `baseBranchRef`, which the user can change. */
function renderChangesPicker({ container, disposableStore, theme }: ComponentFixtureContext, baseBranchRef: string, summary: ISessionChangesSummary, width = 480): void {
	container.style.width = `${width}px`;
	container.style.padding = '8px';

	const branch = upcastPartial<ISessionChangeset>({
		id: BRANCH_CHANGES_CHANGESET_ID,
		label: 'Branch',
		isEnabled: constObservable(true),
		isDefault: constObservable(true),
		baseBranchSelection: constObservable(upcastPartial<ISessionChangesetBaseBranchSelection>({})),
	});
	const changesViewService = new class extends mock<IChangesViewService>() {
		override readonly activeSessionChangesetsObs = constObservable([branch]);
		override readonly activeSessionChangesetsLoadingObs = constObservable(false);
		override readonly activeSessionChangesetObs = constObservable(branch);
		override readonly activeSessionBaseBranchRefObs = constObservable(baseBranchRef);
		override readonly activeSessionChangesSummaryObs = constObservable(summary);
		override readonly activeSessionResourceObs = constObservable(URI.parse('fixture-session:/session'));
	}();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			reg.defineInstance(IChangesViewService, changesViewService);
			reg.defineInstance(IChangesEditorScope, new NoChangesEditorScope());
			reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() { }());
		},
	});

	const action = new MenuItemAction({ id: 'fixture.changesPicker', title: 'Changes' }, undefined, undefined, undefined, undefined, instantiationService.get(IContextKeyService), instantiationService.get(ICommandService));
	const pickerSummary = disposableStore.add(instantiationService.createInstance(ChangesPickerSummary, changesViewService.activeSessionChangesSummaryObs));
	const item = disposableStore.add(instantiationService.createInstance(ChangesPickerActionItem, action, pickerSummary, undefined, undefined));
	const actionBar = dom.append(container, dom.$('.monaco-action-bar'));
	item.render(dom.append(dom.append(actionBar, dom.$('ul.actions-container')), dom.$('li.action-item')));
}

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	BaseBranch: defineComponentFixture({
		render: ctx => renderChangesPicker(ctx, 'refs/remotes/origin/main', { files: 2, additions: 60, deletions: 1 }),
	}),
	CustomBaseBranch: defineComponentFixture({
		render: ctx => renderChangesPicker(ctx, 'refs/remotes/origin/release/1.108', { files: 9, additions: 214, deletions: 37 }),
	}),
	// The label truncates first; the pen, stats, and chevron stay.
	NarrowCustomBaseBranch: defineComponentFixture({
		render: ctx => renderChangesPicker(ctx, 'refs/remotes/origin/release/1.108', { files: 9, additions: 214, deletions: 37 }, 240),
	}),
});
