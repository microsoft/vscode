/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { findGroup } from '../../../../services/editor/common/editorGroupFinder.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { USE_MODAL_EDITOR_SETTING } from '../../../../services/editor/common/editorService.js';
import { createEditorParts, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WorkflowEditorInput } from '../../browser/workflowEditors.js';
import { WorkflowTemplateEntry } from '../../common/workflowCatalog.js';
import { testWorkflowDefinition } from '../common/workflowTestData.js';

suite('Workflow editor input', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(instantiationService: TestInstantiationService, readOnly: boolean): WorkflowEditorInput {
		const entry: WorkflowTemplateEntry = {
			key: `workflow-${readOnly}`, label: 'Feature delivery', definition: testWorkflowDefinition(),
			source: { kind: readOnly ? 'builtin' : 'user', id: 'test' }, readOnly, diagnostics: [],
		};
		return store.add(instantiationService.createInstance(WorkflowEditorInput, entry, URI.parse('workflow-test:/project')));
	}

	test('editable and read-only inputs request modal placement without losing readonly state', () => {
		const instantiationService = store.add(new TestInstantiationService());
		assert.deepStrictEqual([false, true].map(readOnly => createInput(instantiationService, readOnly).capabilities), [
			EditorInputCapabilities.RequiresModal,
			EditorInputCapabilities.RequiresModal | EditorInputCapabilities.Readonly,
		]);
	});

	test('workflow navigation retains an existing modal for editable and read-only inputs', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: service => service.createInstance(MockScopableContextKeyService) }, store);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const configuration = new TestConfigurationService({ [USE_MODAL_EDITOR_SETTING]: 'some' });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const parts = await createEditorParts(instantiationService, store.add(new DisposableStore()));
		instantiationService.stub(IEditorGroupsService, parts);
		const modal = await parts.createModalEditorPart();
		const routes = [];
		for (const readOnly of [false, true]) {
			const input = createInput(instantiationService, readOnly);
			const [group] = await instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: { pinned: true } }, undefined));
			routes.push({ sameModal: parts.activeModalEditorPart === modal, modalGroup: group === modal.activeGroup });
		}
		assert.deepStrictEqual(routes, [{ sameModal: true, modalGroup: true }, { sameModal: true, modalGroup: true }]);
		await modal.close();
	});

	test('workflow navigation respects useModal off for editable and read-only inputs', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: service => service.createInstance(MockScopableContextKeyService) }, store);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const configuration = new TestConfigurationService({ [USE_MODAL_EDITOR_SETTING]: 'off' });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const parts = await createEditorParts(instantiationService, store.add(new DisposableStore()));
		instantiationService.stub(IEditorGroupsService, parts);
		const routes = [];
		for (const readOnly of [false, true]) {
			const input = createInput(instantiationService, readOnly);
			const [group] = await instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: { pinned: true } }, undefined));
			routes.push({ modal: parts.activeModalEditorPart, mainGroup: group === parts.mainPart.activeGroup });
		}
		assert.deepStrictEqual(routes, [{ modal: undefined, mainGroup: true }, { modal: undefined, mainGroup: true }]);
	});
});
