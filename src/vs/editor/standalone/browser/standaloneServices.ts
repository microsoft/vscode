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
import { SimpleBulkEditService, SimpleConfigurationService, SimpleDialogService, SimpleNotificationService, SimpleEditorProgressService, SimpleResourceConfigurationService, SimpleResourcePropertiesService, SimpleUriLabelService, SimpleWorkspaceContextService, StandaloneCommandService, StandaloneKeybindingService, StandaloneTelemetryService, SimpleLayoutService, SimpleWorkspaceTrustManagementService, SimpleTextModelService } from 'vs/editor/standalone/browser/simpleServices';
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
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
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
import { IThemeService } from 'vs/platform/theme/common/themeService';
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

export interface IEditorOverrideServices {
	[index: string]: any;
}

/**
 *
 * !!! README !!!
 *
 * Some services need the editor's container dom node and are therefore dynamic (i.e. a new service instance is created
 * per each editor instance). For example, the `IKeybindingService` needs to attach dom listeners on the editor's container
 * dom node. There can't be a single service, because it cannot attach such a listener to the <body> of the page, as that
 * would interfere with the page where the editor is embedded.
 *
 * However, most services are static and must be shared across all editor instances. For example, `IModelService` needs
 * to be shared across all editors.
 *
 * Finally, we don't want to eagerly instantiate services because embedders can override services when they create editors.
 */
export module StaticServices {

	const _serviceCollection = new ServiceCollection();

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
				if (!this._value) {
					throw new Error('Service ' + this._serviceId + ' is missing!');
				}
				_serviceCollection.set(this._serviceId, this._value);
			}
			return this._value;
		}
	}

	const _all: LazyStaticService<any>[] = [];

	function define<T>(serviceId: ServiceIdentifier<T>, factory: (overrides: IEditorOverrideServices | undefined) => T): LazyStaticService<T> {
		const r = new LazyStaticService(serviceId, factory);
		_all.push(r);
		return r;
	}

	export function init(overrides: IEditorOverrideServices): [ServiceCollection, IInstantiationService] {
		// Create a fresh service collection
		const result = new ServiceCollection();

		// make sure to add all services that use `registerSingleton`
		for (const [id, descriptor] of getSingletonServiceDescriptors()) {
			result.set(id, descriptor);
		}

		// Initialize the service collection with the overrides
		for (const serviceId in overrides) {
			if (overrides.hasOwnProperty(serviceId)) {
				result.set(createDecorator(serviceId), overrides[serviceId]);
			}
		}

		// Make sure the same static services are present in all service collections
		_all.forEach(service => result.set(service.id, service.get(overrides)));

		// Ensure the collection gets the correct instantiation service
		const instantiationService = new InstantiationService(result, true);
		result.set(IInstantiationService, instantiationService);

		return [result, instantiationService];
	}

	// export const instantiationService = define<IInstantiationService>(IInstantiationService, () => new InstantiationService(_serviceCollection, true));

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

	export const codeEditorService = define(ICodeEditorService, (o) => new StandaloneCodeEditorServiceImpl(null, contextKeyService.get(o), standaloneThemeService.get(o)));

	export const editorProgressService = define(IEditorProgressService, () => new SimpleEditorProgressService());

	export const storageService = define(IStorageService, () => new InMemoryStorageService());

	export const editorWorkerService = define(IEditorWorkerService, (o) => new EditorWorkerServiceImpl(modelService.get(o), resourceConfigurationService.get(o), logService.get(o), languageConfigurationService.get(o)));

	export const bulkEditService = define(IBulkEditService, (o) => new SimpleBulkEditService(modelService.get(o)));

	export const workspaceTrustManagementService = define(IWorkspaceTrustManagementService, () => new SimpleWorkspaceTrustManagementService());

	export const textModelService = define(ITextModelService, (o) => new SimpleTextModelService(modelService.get(o)));

	export const accessibilityService = define(IAccessibilityService, (o) => new AccessibilityService(contextKeyService.get(o), configurationService.get(o)));

	export const listService = define(IListService, (o) => new ListService(standaloneThemeService.get(o)));
}

export class DynamicStandaloneServices extends Disposable {

	private readonly _serviceCollection: ServiceCollection;

	constructor(domElement: HTMLElement, overrides: IEditorOverrideServices) {
		super();

		const [_serviceCollection, instantiationService] = StaticServices.init(overrides);
		this._serviceCollection = _serviceCollection;

		const notificationService = this.get(INotificationService);
		const telemetryService = this.get(ITelemetryService);
		const themeService = this.get(IThemeService);
		const logService = this.get(ILogService);
		const contextKeyService = this.get(IContextKeyService);
		const codeEditorService = this.get(ICodeEditorService);

		const ensure = <T>(serviceId: ServiceIdentifier<T>, factory: () => T): T => {
			let value: T | null = null;
			if (overrides) {
				value = overrides[serviceId.toString()];
			}
			if (!value) {
				value = factory();
			}
			this._serviceCollection.set(serviceId, value);
			return value;
		};

		const commandService = ensure(ICommandService, () => new StandaloneCommandService(instantiationService));

		const keybindingService = ensure(IKeybindingService, () => this._register(new StandaloneKeybindingService(contextKeyService, commandService, telemetryService, notificationService, logService, domElement)));

		const layoutService = ensure(ILayoutService, () => new SimpleLayoutService(codeEditorService, domElement));

		ensure(IQuickInputService, () => new StandaloneQuickInputServiceImpl(instantiationService, codeEditorService));

		const contextViewService = ensure(IContextViewService, () => this._register(new ContextViewService(layoutService)));

		ensure(IOpenerService, () => new OpenerService(codeEditorService, commandService));

		ensure(IClipboardService, () => new BrowserClipboardService(layoutService, logService));

		ensure(IContextMenuService, () => {
			const contextMenuService = new ContextMenuService(telemetryService, notificationService, contextViewService, keybindingService, themeService);
			contextMenuService.configure({ blockMouse: false }); // we do not want that in the standalone editor

			return this._register(contextMenuService);
		});

		ensure(IMenuService, () => new MenuService(commandService));
	}

	public get<T>(serviceId: ServiceIdentifier<T>): T {
		const r = <T>this._serviceCollection.get(serviceId);
		if (!r) {
			throw new Error('Missing service ' + serviceId);
		}
		return r;
	}
}
