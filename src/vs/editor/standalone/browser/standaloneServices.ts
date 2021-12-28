/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { ILanguageService } from 'vs/editor/common/services/languageService';
import { LanguageService } from 'vs/editor/common/services/languageServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfigurationService';
import { SimpleBulkEditService, SimpleConfigurationService, SimpleDialogService, SimpleNotificationService, SimpleEditorProgressService, SimpleResourceConfigurationService, SimpleResourcePropertiesService, SimpleUriLabelService, SimpleWorkspaceContextService, StandaloneCommandService, StandaloneKeybindingService, StandaloneTelemetryService, SimpleLayoutService, SimpleWorkspaceTrustManagementService, SimpleTextModelService, StandaloneContextViewService } from 'vs/editor/standalone/browser/simpleServices';
import { StandaloneCodeEditorServiceImpl } from 'vs/editor/standalone/browser/standaloneCodeServiceImpl';
import { StandaloneThemeServiceImpl } from 'vs/editor/standalone/browser/standaloneThemeServiceImpl';
import { IStandaloneThemeService } from 'vs/editor/standalone/common/standaloneThemeService';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServiceIdentifier, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { ConsoleLogger, ILogService, LogService } from 'vs/platform/log/common/log';
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
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { AccessibilityService } from 'vs/platform/accessibility/browser/accessibilityService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { UndoRedoService } from 'vs/platform/undoRedo/common/undoRedoService';
import { StandaloneQuickInputServiceImpl } from 'vs/editor/standalone/browser/quickInput/standaloneQuickInputServiceImpl';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ILanguageConfigurationService, LanguageConfigurationService } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

export interface IEditorOverrideServices {
	[index: string]: any;
}

/**
 * We don't want to eagerly instantiate services because embedders can override
 * services when they create the first editor.
 *
 * Once the first editor is instantiated, all services will get instantiated.
 */
export module StaticServices {

	const _serviceCollection = new ServiceCollection();
	const _all: LazyStaticService<any>[] = [];
	let _initialized = false;

	export class LazyStaticService<T> {
		private readonly _serviceId: ServiceIdentifier<T>;
		private readonly _factory: (overrides?: IEditorOverrideServices) => T;
		private _value: T | null;

		public get id() { return this._serviceId; }

		constructor(serviceId: ServiceIdentifier<T>, factory: (overrides?: IEditorOverrideServices) => T) {
			this._serviceId = serviceId;
			this._factory = factory;
			this._value = null;
		}

		public get(overrides?: IEditorOverrideServices): T {
			if (!this._value) {
				if (overrides) {
					this._value = overrides[this._serviceId.toString()];
				}
				if (!this._value) {
					this._value = this._factory(overrides);
				}
				_serviceCollection.set(this._serviceId, this._value);
			}
			return this._value;
		}
	}

	function define<T>(serviceId: ServiceIdentifier<T>, factory: (overrides: IEditorOverrideServices | undefined) => T): LazyStaticService<T> {
		const r = new LazyStaticService(serviceId, factory);
		_all.push(r);
		return r;
	}

	export function init(overrides: IEditorOverrideServices): [ServiceCollection, IInstantiationService] {
		if (_initialized) {
			return [_serviceCollection, instantiationService.get()];
		}
		_initialized = true;

		// make sure to add all services that use `registerSingleton`
		for (const [id, descriptor] of getSingletonServiceDescriptors()) {
			_serviceCollection.set(id, descriptor);
		}

		// Initialize the service collection with the overrides
		for (const serviceId in overrides) {
			if (overrides.hasOwnProperty(serviceId)) {
				_serviceCollection.set(createDecorator(serviceId), overrides[serviceId]);
			}
		}

		// Make sure the same static services are present in all service collections
		_all.forEach(service => service.get(overrides));

		return [_serviceCollection, instantiationService.get()];
	}

	export const instantiationService = define(IInstantiationService, () => new InstantiationService(_serviceCollection, true));

	const configurationServiceImpl = new SimpleConfigurationService();
	export const configurationService = define(IConfigurationService, () => configurationServiceImpl);

	export const resourceConfigurationService = define(ITextResourceConfigurationService, () => new SimpleResourceConfigurationService(configurationServiceImpl));

	export const resourcePropertiesService = define(ITextResourcePropertiesService, () => new SimpleResourcePropertiesService(configurationServiceImpl));

	export const contextService = define(IWorkspaceContextService, () => new SimpleWorkspaceContextService());

	export const labelService = define(ILabelService, () => new SimpleUriLabelService());

	export const telemetryService = define(ITelemetryService, () => new StandaloneTelemetryService());

	export const dialogService = define(IDialogService, () => new SimpleDialogService());

	export const notificationService = define(INotificationService, () => new SimpleNotificationService());

	export const markerService = define(IMarkerService, () => new MarkerService());

	export const languageService = define(ILanguageService, () => new LanguageService());

	export const standaloneThemeService = define(IStandaloneThemeService, () => new StandaloneThemeServiceImpl());

	export const logService = define(ILogService, () => new LogService(new ConsoleLogger()));

	export const undoRedoService = define(IUndoRedoService, (o) => new UndoRedoService(dialogService.get(o), notificationService.get(o)));

	export const languageConfigurationService = define(ILanguageConfigurationService, (o) => new LanguageConfigurationService(configurationService.get(o), languageService.get(o)));

	export const modelService = define(
		IModelService,
		(o) =>
			new ModelServiceImpl(
				configurationService.get(o),
				resourcePropertiesService.get(o),
				standaloneThemeService.get(o),
				logService.get(o),
				undoRedoService.get(o),
				languageService.get(o),
				languageConfigurationService.get(o)
			)
	);

	export const markerDecorationsService = define(IMarkerDecorationsService, (o) => new MarkerDecorationsService(modelService.get(o), markerService.get(o)));

	export const contextKeyService = define(IContextKeyService, (o) => new ContextKeyService(configurationService.get(o)));

	export const codeEditorService = define(ICodeEditorService, (o) => new StandaloneCodeEditorServiceImpl(contextKeyService.get(o), standaloneThemeService.get(o)));

	export const editorProgressService = define(IEditorProgressService, () => new SimpleEditorProgressService());

	export const storageService = define(IStorageService, () => new InMemoryStorageService());

	export const editorWorkerService = define(IEditorWorkerService, (o) => new EditorWorkerServiceImpl(modelService.get(o), resourceConfigurationService.get(o), logService.get(o), languageConfigurationService.get(o)));

	export const bulkEditService = define(IBulkEditService, (o) => new SimpleBulkEditService(modelService.get(o)));

	export const workspaceTrustManagementService = define(IWorkspaceTrustManagementService, () => new SimpleWorkspaceTrustManagementService());

	export const textModelService = define(ITextModelService, (o) => new SimpleTextModelService(modelService.get(o)));

	export const accessibilityService = define(IAccessibilityService, (o) => new AccessibilityService(contextKeyService.get(o), configurationService.get(o)));

	export const listService = define(IListService, (o) => new ListService(standaloneThemeService.get(o)));

	export const commandService = define(ICommandService, (o) => new StandaloneCommandService(instantiationService.get(o)));

	export const keybindingService = define(IKeybindingService, (o) => new StandaloneKeybindingService(contextKeyService.get(o), commandService.get(o), telemetryService.get(o), notificationService.get(o), logService.get(o), codeEditorService.get(o)));

	export const layoutService = define(ILayoutService, (o) => new SimpleLayoutService(codeEditorService.get(o)));

	export const quickInputService = define(IQuickInputService, (o) => new StandaloneQuickInputServiceImpl(instantiationService.get(o), codeEditorService.get(o)));

	export const contextViewService = define(IContextViewService, (o) => new StandaloneContextViewService(layoutService.get(o), codeEditorService.get(o)));

	export const openerService = define(IOpenerService, (o) => new OpenerService(codeEditorService.get(o), commandService.get(o)));

	export const clipboardService = define(IClipboardService, (o) => new BrowserClipboardService(layoutService.get(o), logService.get(o)));

	export const contextMenuService = define(IContextMenuService, (o) => {
		const contextMenuService = new ContextMenuService(telemetryService.get(o), notificationService.get(o), contextViewService.get(o), keybindingService.get(o), standaloneThemeService.get(o));
		contextMenuService.configure({ blockMouse: false }); // we do not want that in the standalone editor
		return contextMenuService;
	});

	export const menuService = define(IMenuService, (o) => new MenuService(commandService.get(o)));
}

export class StandaloneServices extends Disposable {

	private readonly _serviceCollection: ServiceCollection;
	public readonly instantiationService: IInstantiationService;

	constructor(overrides: IEditorOverrideServices) {
		super();

		const [_serviceCollection, instantiationService] = StaticServices.init(overrides);
		this._serviceCollection = _serviceCollection;
		this.instantiationService = instantiationService;
	}

	public get<T>(serviceId: ServiceIdentifier<T>): T {
		const r = this._serviceCollection.get(serviceId);
		if (!r) {
			throw new Error('Missing service ' + serviceId);
		}
		if (r instanceof SyncDescriptor) {
			return this.instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
		} else {
			return r;
		}
	}
}
