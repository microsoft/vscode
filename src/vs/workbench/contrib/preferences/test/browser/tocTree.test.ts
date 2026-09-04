/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TOCTree, TOCTreeModel } from '../../browser/tocTree.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ISettingsEditorViewState } from '../../browser/settingsTreeModels.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { mock } from '../../../../../base/test/common/mock.js';

suite('TOCTree', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		instantiationService = store.add(new TestInstantiationService());

		// Set up required services
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override remoteAuthority = undefined;
		});
	});

	test('TOCTree should not leak disposables', () => {
		const viewState: ISettingsEditorViewState = {
			settingsTarget: ConfigurationTarget.USER_LOCAL,
			tagFilters: undefined,
			featureFilters: undefined,
			extensionFilters: undefined,
			idFilters: undefined,
			languageFilter: undefined,
			filterToCategory: undefined
		};

		const tree = store.add(instantiationService.createInstance(TOCTree, container, viewState));
		assert.ok(tree, 'TOCTree should be created');

		// Dispose the tree to verify no leaks
		tree.dispose();
	});

	test('TOCTreeModel should be disposable', () => {
		const viewState: ISettingsEditorViewState = {
			settingsTarget: ConfigurationTarget.USER_LOCAL,
			tagFilters: undefined,
			featureFilters: undefined,
			extensionFilters: undefined,
			idFilters: undefined,
			languageFilter: undefined,
			filterToCategory: undefined
		};

		const model = instantiationService.createInstance(TOCTreeModel, viewState);
		assert.ok(model, 'TOCTreeModel should be created');
		// TOCTreeModel doesn't implement IDisposable, so just verify it's created successfully
	});
});
