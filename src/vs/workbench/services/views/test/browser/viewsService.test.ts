/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { PaneCompositeRegistry } from '../../../../browser/panecomposite.js';
import { getEnabledViewContainerContextKey, LayoutModeContext } from '../../../../common/contextkeys.js';
import { IViewDescriptorService, IViewContainerModel, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorService } from '../../../editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../panecomposite/browser/panecomposite.js';
import { ViewsService } from '../../browser/viewsService.js';

const paneCompositesRegistryId = 'test.viewsService.paneComposites';
Registry.add(paneCompositesRegistryId, new PaneCompositeRegistry());

suite('ViewsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('the key of a view container\'s open command applies in a window without layout modes, not in one with them, such as a chat window, whose parts are not the main window\'s', () => {
		const viewContainer = upcastPartial<ViewContainer>({
			id: 'test.viewsService.container',
			title: { value: 'Container', original: 'Container' },
			openCommandActionDescriptor: { id: 'test.viewsService.openContainer', keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE } },
		});
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({
			viewContainers: [viewContainer],
			getViewContainerLocation: () => ViewContainerLocation.AuxiliaryBar,
			getViewContainerModel: () => upcastPartial<IViewContainerModel>({ allViewDescriptors: [], activeViewDescriptors: [], onDidChangeAllViewDescriptors: Event.None, onDidChangeActiveViewDescriptors: Event.None }),
			onDidChangeViewContainers: Event.None,
			onDidChangeContainerLocation: Event.None,
		}));
		instantiationService.stub(IPaneCompositePartService, upcastPartial<IPaneCompositePartService>({ onDidPaneCompositeOpen: Event.None, onDidPaneCompositeClose: Event.None, getRegistryId: () => paneCompositesRegistryId }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({}));
		disposables.add(instantiationService.createInstance(ViewsService));

		const rule = KeybindingsRegistry.getDefaultKeybindings().find(candidate => candidate.command === 'test.viewsService.openContainer')!;
		const applies = (values: Record<string, ContextKeyValue>) => rule.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined }) !== false;
		const enabled = { [getEnabledViewContainerContextKey(viewContainer.id)]: true };

		assert.deepStrictEqual({
			window: applies(enabled),
			windowWithLayoutModes: applies({ ...enabled, [LayoutModeContext.key]: 'sideBySide' }),
		}, {
			window: true,
			windowWithLayoutModes: false,
		});
	});
});
