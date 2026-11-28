/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../../../contrib/sessions/common/changesViewService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IChangesRepository } from '../../../../contrib/sessions/common/changesRepositories.js';
import { ChangesRepositoryPickerActionItem } from '../../../../contrib/sessionChanges/browser/changesRepositoryPicker.js';
import { IGitHubInfo, ISession, ISessionChangeset, ISessionChangesetFolderFailure, SessionRepositoryKind } from '../../../../services/sessions/common/session.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const VSCODE = URI.file('/workspace/vscode');
const DOCS = URI.file('/workspace/vscode-docs');

const REPOSITORIES: readonly IChangesRepository[] = [
	{ root: VSCODE, folder: VSCODE, name: 'vscode', description: undefined, kind: SessionRepositoryKind.Folder, gitRepository: { uri: VSCODE, workTreeUri: undefined, branchName: 'feature/projects', baseBranchName: 'main', gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) } },
	{ root: DOCS, folder: DOCS, name: 'vscode-docs', description: undefined, kind: SessionRepositoryKind.Folder, gitRepository: { uri: DOCS, workTreeUri: undefined, branchName: 'docs/projects', baseBranchName: 'main', gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) } },
];

/** Renders the Repository picker of a Changes header, as it shows all repositories or one, or open with its list. */
function renderPicker({ container, disposableStore, theme }: ComponentFixtureContext, selected: IChangesRepository | undefined, open = false): void {
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	if (open) {
		container.style.position = 'relative';
		container.style.width = '320px';
		container.style.height = '180px';
	}

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			if (!open) {
				reg.defineInstance(IActionWidgetService, new class extends mock<IActionWidgetService>() { }());
			}
			// The fixture's repositories are each a folder's own, whose failures the host reports by the folder
			reg.defineInstance(IChangesViewService, new class extends mock<IChangesViewService>() {
				override findRepositoryFailure(repository: IChangesRepository, failures: readonly ISessionChangesetFolderFailure[]) {
					return failures.find(failure => isEqual(failure.workingDirectory, repository.folder));
				}
			}());
		},
	});
	if (open) {
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = Event.None;
			override getContainer() { return container; }
		}());
		instantiationService.set(IContextViewService, disposableStore.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.set(IActionWidgetService, disposableStore.add(instantiationService.createInstance(ActionWidgetService)));
	}

	// The second repository's changes could not be loaded, which its row says when the list is open
	const changeset = new class extends mock<ISessionChangeset>() {
		override readonly folderFailures = constObservable<readonly ISessionChangesetFolderFailure[]>(open ? [{ workingDirectory: DOCS, message: 'Git failed: not a repository' }] : []);
	}();
	const changes = new class extends mock<IChangesSessionObservables>() {
		override readonly repositoriesObs = constObservable(REPOSITORIES);
		override readonly repositoryObs: IObservable<IChangesRepository | undefined> = constObservable(selected);
		override readonly changesetObs: IObservable<ISessionChangeset | undefined> = constObservable(changeset);
	}();
	const scope: IChangesSessionScope = {
		session: constObservable(new class extends mock<ISession>() { }()),
		chat: constObservable(undefined),
		changes,
		isMainWindow: false,
	};
	const action = new MenuItemAction({ id: 'fixture.repositoryPicker', title: 'Repository', icon: Codicon.repo }, undefined, undefined, undefined, undefined, instantiationService.get(IContextKeyService), new class extends mock<ICommandService>() { }());
	const item = disposableStore.add(instantiationService.createInstance(ChangesRepositoryPickerActionItem, action, scope));
	item.render(dom.append(container, dom.$('.changes-repository-picker-fixture')));
	if (open) {
		item.show();
		disposableStore.add(toDisposable(() => instantiationService.get(IActionWidgetService).hide()));
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/changes/repositoryPicker/' }, {
	AllRepositories: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A compact picker shows a repositories icon, the label "All Repositories" and a chevron.'],
		render: ctx => renderPicker(ctx, undefined),
	}),
	Open: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The picker is open below its trigger: "All Repositories" checked, then "vscode" with its branch, then "vscode-docs" with an error icon and its failure message.'],
		render: ctx => renderPicker(ctx, undefined, true),
	}),
	OneRepository: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A compact picker shows a repository icon, the label "vscode-docs" and a chevron.'],
		render: ctx => renderPicker(ctx, REPOSITORIES[1]),
	}),
});
