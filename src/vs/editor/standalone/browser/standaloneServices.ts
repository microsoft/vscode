/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { ILanguageService } from 'vs/editor/common/services/languageService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfigurationService';
import { SimpleBulkEditService, SimpleConfigurationService, SimpleDialogService, SimpleNotificationService, SimpleEditorProgressService, SimpleResourceConfigurationService, SimpleResourcePropertiesService, SimpleUriLabelService, SimpleWorkspaceContextService, StandaloneCommandService, StandaloneKeybindingService, StandaloneTelemetryService, SimpleLayoutService, SimpleWorkspaceTrustManagementService, SimpleTextModelService, StandaloneContextViewService, StandaloneLanguageService, StandaloneLogService, StandaloneContextMenuService } from 'vs/editor/standalone/browser/simpleServices';
import { StandaloneCodeEditorServiceImpl } from 'vs/editor/standalone/browser/standaloneCodeServiceImpl';
import { StandaloneThemeServiceImpl } from 'vs/editor/standalone/browser/standaloneThemeServiceImpl';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneThemeService';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServiceIdentifier, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { IStorageService, InMemoryStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { getSingletonServiceDescriptors, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AccessibilityService } from 'vs/platform/accessibility/browser/accessibilityService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { StandaloneQuickInputServiceImpl } from 'vs/editor/standalone/browser/quickInput/standaloneQuickInputServiceImpl';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

import 'vs/platform/undoRedo/common/undoRedoService';
import 'vs/editor/common/modes/languageConfigurationRegistry';

export interface IEditorOverrideServices {
	[index: string]: any;
}

registerSingleton(IConfigurationService, SimpleConfigurationService);
registerSingleton(ITextResourceConfigurationService, SimpleResourceConfigurationService);
registerSingleton(ITextResourcePropertiesService, SimpleResourcePropertiesService);
registerSingleton(IWorkspaceContextService, SimpleWorkspaceContextService);
registerSingleton(ILabelService, SimpleUriLabelService);
registerSingleton(ITelemetryService, StandaloneTelemetryService);
registerSingleton(IDialogService, SimpleDialogService);
registerSingleton(INotificationService, SimpleNotificationService);
registerSingleton(IMarkerService, MarkerService);
registerSingleton(ILanguageService, StandaloneLanguageService);
registerSingleton(IStandaloneThemeService, StandaloneThemeServiceImpl);
registerSingleton(ILogService, StandaloneLogService);
registerSingleton(IModelService, ModelServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(ICodeEditorService, StandaloneCodeEditorServiceImpl);
registerSingleton(IEditorProgressService, SimpleEditorProgressService);
registerSingleton(IStorageService, InMemoryStorageService);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IBulkEditService, SimpleBulkEditService);
registerSingleton(IWorkspaceTrustManagementService, SimpleWorkspaceTrustManagementService);
registerSingleton(ITextModelService, SimpleTextModelService);
registerSingleton(IAccessibilityService, AccessibilityService);
registerSingleton(IListService, ListService);
registerSingleton(ICommandService, StandaloneCommandService);
registerSingleton(IKeybindingService, StandaloneKeybindingService);
registerSingleton(ILayoutService, SimpleLayoutService);
registerSingleton(IQuickInputService, StandaloneQuickInputServiceImpl);
registerSingleton(IContextViewService, StandaloneContextViewService);
registerSingleton(IOpenerService, OpenerService);
registerSingleton(IClipboardService, BrowserClipboardService);
registerSingleton(IContextMenuService, StandaloneContextMenuService);
registerSingleton(IMenuService, MenuService);

/**
 * We don't want to eagerly instantiate services because embedders get a one time chance
 * to override services when they create the first editor.
 */
export module StaticServices {

	const serviceCollection = new ServiceCollection();
	for (const [id, descriptor] of getSingletonServiceDescriptors()) {
		serviceCollection.set(id, descriptor);
	}

	const instantiationService = new InstantiationService(serviceCollection, true);
	serviceCollection.set(IInstantiationService, instantiationService);

	export function get<T>(serviceId: ServiceIdentifier<T>): T {
		const r = serviceCollection.get(serviceId);
		if (!r) {
			throw new Error('Missing service ' + serviceId);
		}
		if (r instanceof SyncDescriptor) {
			return instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
		} else {
			return r;
		}
	}

	let initialized = false;
	export function initialize(overrides: IEditorOverrideServices): IInstantiationService {
		if (initialized) {
			return instantiationService;
		}
		initialized = true;

		// Initialize the service collection with the overrides, but only if the
		// service was not instantiated in the meantime.
		for (const serviceId in overrides) {
			if (overrides.hasOwnProperty(serviceId)) {
				const serviceIdentifier = createDecorator(serviceId);
				const r = serviceCollection.get(serviceIdentifier);
				if (r instanceof SyncDescriptor) {
					serviceCollection.set(serviceIdentifier, overrides[serviceId]);
				}
			}
		}

		return instantiationService;
	}
}
