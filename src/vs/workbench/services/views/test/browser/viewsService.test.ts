/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { PaneCompositeRegistry } from '../../../../browser/panecomposite.js';
import { getEnabledViewContainerContextKey, LayoutModeContext } from '../../../../common/contextkeys.js';
import { IView, IViewDescriptorService, IViewContainerModel, IViewPaneContainer, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IEditorService } from '../../../editor/common/editorService.js';
import { IExtensionService, NullExtensionService } from '../../../extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../panecomposite/browser/panecomposite.js';
import { ViewsService } from '../../browser/viewsService.js';

const paneCompositesRegistryId = 'test.viewsService.paneComposites';
Registry.add(paneCompositesRegistryId, new PaneCompositeRegistry());

suite('ViewsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createViewsService(viewContainer: ViewContainer): TestInstantiationService {
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
		return instantiationService;
	}

	test('updates a view container\'s title area once per title change of its views', () => {
		const onTitleAreaUpdate = disposables.add(new Emitter<void>());
		const onDidAddViews = disposables.add(new Emitter<IView[]>());
		class TestViewPaneContainer extends Disposable {
			readonly onTitleAreaUpdate = onTitleAreaUpdate.event;
			readonly onDidAddViews = onDidAddViews.event;
			readonly onDidRemoveViews = Event.None;
			readonly onDidChangeViewVisibility = Event.None;
			readonly onDidFocusView = Event.None;
			readonly onDidBlurView = Event.None;
			getId(): string { return 'test.viewsService.titleAreaContainer'; }
			create(): void { }
		}
		const viewContainer = upcastPartial<ViewContainer>({
			id: 'test.viewsService.titleAreaContainer',
			title: { value: 'Container', original: 'Container' },
			ctorDescriptor: new SyncDescriptor(TestViewPaneContainer as unknown as new () => IViewPaneContainer),
		});
		const instantiationService = createViewsService(viewContainer);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({}));
		instantiationService.stub(IExtensionService, new NullExtensionService());
		const composite = disposables.add(Registry.as<PaneCompositeRegistry>(paneCompositesRegistryId).getPaneComposite(viewContainer.id).instantiate(instantiationService));
		composite.create(document.createElement('div'));
		let updates = 0;
		disposables.add(composite.onTitleAreaUpdate(() => updates++));

		onTitleAreaUpdate.fire();
		const afterTitleChange = updates;
		onDidAddViews.fire([]);

		assert.deepStrictEqual({ afterTitleChange, afterViewsAdded: updates }, { afterTitleChange: 1, afterViewsAdded: 2 });
	});

	test('the key of a view container\'s open command applies in a window without layout modes, not in one with them, such as a chat window, whose parts are not the main window\'s', () => {
		const viewContainer = upcastPartial<ViewContainer>({
			id: 'test.viewsService.container',
			title: { value: 'Container', original: 'Container' },
			openCommandActionDescriptor: { id: 'test.viewsService.openContainer', keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE } },
		});
		createViewsService(viewContainer);

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
