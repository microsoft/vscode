/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISession, SessionRepositoryKind } from '../../../../services/sessions/common/session.js';
import { IChangesRepository } from '../../../sessions/common/changesRepositories.js';
import { IChangesSessionObservables, IChangesSessionScope, IChangesViewService } from '../../../sessions/common/changesViewService.js';
import { ChangesRepositoryPickerActionItem } from '../../browser/changesRepositoryPicker.js';

suite('ChangesRepositoryPicker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('checks only the picked repository of those whose roots differ only in case on a file system that compares paths by case', () => {
		const repository = (path: string): IChangesRepository => {
			const root = URI.file(path).with({ scheme: 'vscode-agent-host', authority: 'remote' });
			return { root, folder: root, folders: [root], name: path.split('/').pop()!, description: undefined, kind: SessionRepositoryKind.Folder, gitRepository: undefined };
		};
		const repositories = [repository('/work/Mono'), repository('/work/mono')];
		const selected = observableValue<IChangesRepository | undefined>('test.selected', undefined);
		let shown: readonly IActionListItem<IActionWidgetDropdownAction>[] = [];

		const instantiationService = disposables.add(new TestInstantiationService());
		const contextKeyService = disposables.add(new MockContextKeyService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() { override lookupKeybinding() { return undefined; } }());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IChangesViewService, new class extends mock<IChangesViewService>() { override findRepositoryFailure() { return undefined; } }());
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() { override readonly extUri = new ExtUri(() => false); }());
		const capture = <T>(items: readonly IActionListItem<T>[]) => { shown = items as readonly IActionListItem<unknown>[] as readonly IActionListItem<IActionWidgetDropdownAction>[]; };
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[]) { capture(items); }
			override updateItems<T>(items: readonly IActionListItem<T>[]) { capture(items); }
			override hide() { }
		}());
		const changes = new class extends mock<IChangesSessionObservables>() {
			override readonly repositoriesObs = constObservable(repositories);
			override readonly repositoryObs: IObservable<IChangesRepository | undefined> = selected;
			override readonly changesetObs = constObservable(undefined);
		}();
		const scope: IChangesSessionScope = { session: constObservable(new class extends mock<ISession>() { }()), chat: constObservable(undefined), changes, isMainWindow: false };
		const action = new MenuItemAction({ id: 'test.repositoryPicker', title: 'Repository', icon: Codicon.repo }, undefined, undefined, undefined, undefined, contextKeyService, new class extends mock<ICommandService>() { }());
		const item = disposables.add(instantiationService.createInstance(ChangesRepositoryPickerActionItem, action, scope));
		item.render(document.createElement('div'));

		const checkedRows = (repository: IChangesRepository) => {
			selected.set(repository, undefined);
			item.show();
			return shown.filter(row => row.item?.checked).map(row => row.label);
		};
		assert.deepStrictEqual({ upper: checkedRows(repositories[0]), lower: checkedRows(repositories[1]) }, { upper: ['Mono'], lower: ['mono'] });
	});
});
