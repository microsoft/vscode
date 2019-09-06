/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { forEach } from 'vs/base/common/collections';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as resources from 'vs/base/common/resources';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ViewContainer, IViewsRegistry, ITreeViewDescriptor, IViewContainersRegistry, Extensions as ViewContainerExtensions, TEST_VIEW_CONTAINER_ID, IViewDescriptor } from 'vs/workbench/common/views';
import { CustomTreeViewPanel, CustomTreeView } from 'vs/workbench/browser/parts/views/customView';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { coalesce, } from 'vs/base/common/arrays';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { VIEWLET_ID as EXPLORER } from 'vs/workbench/contrib/files/common/files';
import { VIEWLET_ID as SCM } from 'vs/workbench/contrib/scm/common/scm';
import { VIEWLET_ID as DEBUG } from 'vs/workbench/contrib/debug/common/debug';
import { VIEWLET_ID as REMOTE } from 'vs/workbench/contrib/remote/common/remote.contribution';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ShowViewletAction } from 'vs/workbench/browser/viewlet';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ViewContainerViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { createCSSRule, asCSSUrl } from 'vs/base/browser/dom';

export interface IUserFriendlyViewsContainerDescriptor {
	id: string;
	title: string;
	icon: string;
}

const viewsContainerSchema: IJSONSchema = {
	type: 'object',
	properties: {
		id: {
			description: localize({ key: 'vscode.extension.contributes.views.containers.id', comment: ['Contribution refers to those that an extension contributes to VS Code through an extension/contribution point. '] }, "Unique id used to identify the container in which views can be contributed using 'views' contribution point"),
			type: 'string',
			pattern: '^[a-zA-Z0-9_-]+$'
		},
		title: {
			description: localize('vscode.extension.contributes.views.containers.title', 'Human readable string used to render the container'),
			type: 'string'
		},
		icon: {
			description: localize('vscode.extension.contributes.views.containers.icon', "Path to the container icon. Icons are 24x24 centered on a 50x40 block and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted."),
			type: 'string'
		}
	}
};

export const viewsContainersContribution: IJSONSchema = {
	description: localize('vscode.extension.contributes.viewsContainers', 'Contributes views containers to the editor'),
	type: 'object',
	properties: {
		'activitybar': {
			description: localize('views.container.activitybar', "Contribute views containers to Activity Bar"),
			type: 'array',
			items: viewsContainerSchema
		}
	}
};

interface IUserFriendlyViewDescriptor {
	id: string;
	name: string;
	when?: string;
	group?: string;
}

const viewDescriptor: IJSONSchema = {
	type: 'object',
	properties: {
		id: {
			description: localize('vscode.extension.contributes.view.id', 'Identifier of the view. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`.'),
			type: 'string'
		},
		name: {
			description: localize('vscode.extension.contributes.view.name', 'The human-readable name of the view. Will be shown'),
			type: 'string'
		},
		when: {
			description: localize('vscode.extension.contributes.view.when', 'Condition which must be true to show this view'),
			type: 'string'
		},
	}
};

const nestableViewDescriptor: IJSONSchema = {
	type: 'object',
	properties: {
		id: {
			description: localize('vscode.extension.contributes.view.id', 'Identifier of the view. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`.'),
			type: 'string'
		},
		name: {
			description: localize('vscode.extension.contributes.view.name', 'The human-readable name of the view. Will be shown'),
			type: 'string'
		},
		when: {
			description: localize('vscode.extension.contributes.view.when', 'Condition which must be true to show this view'),
			type: 'string'
		},
		group: {
			description: localize('vscode.extension.contributes.view.group', 'Nested group in the viewlet'),
			type: 'string'
		}
	}
};
const viewsContribution: IJSONSchema = {
	description: localize('vscode.extension.contributes.views', "Contributes views to the editor"),
	type: 'object',
	properties: {
		'explorer': {
			description: localize('views.explorer', "Contributes views to Explorer container in the Activity bar"),
			type: 'array',
			items: viewDescriptor,
			default: []
		},
		'debug': {
			description: localize('views.debug', "Contributes views to Debug container in the Activity bar"),
			type: 'array',
			items: viewDescriptor,
			default: []
		},
		'scm': {
			description: localize('views.scm', "Contributes views to SCM container in the Activity bar"),
			type: 'array',
			items: viewDescriptor,
			default: []
		},
		'test': {
			description: localize('views.test', "Contributes views to Test container in the Activity bar"),
			type: 'array',
			items: viewDescriptor,
			default: []
		},
		'remote': {
			description: localize('views.remote', "Contributes views to Remote container in the Activity bar. To contribute to this container, enableProposedApi needs to be turned on"),
			type: 'array',
			items: nestableViewDescriptor,
			default: []
		}
	},
	additionalProperties: {
		description: localize('views.contributed', "Contributes views to contributed views container"),
		type: 'array',
		items: viewDescriptor,
		default: []
	}
};

export interface ICustomViewDescriptor extends ITreeViewDescriptor {
	readonly extensionId: ExtensionIdentifier;
	readonly originalContainerId: string;
}

type ViewContainerExtensionPointType = { [loc: string]: IUserFriendlyViewsContainerDescriptor[] };
const viewsContainersExtensionPoint: IExtensionPoint<ViewContainerExtensionPointType> = ExtensionsRegistry.registerExtensionPoint<ViewContainerExtensionPointType>({
	extensionPoint: 'viewsContainers',
	jsonSchema: viewsContainersContribution
});

type ViewExtensionPointType = { [loc: string]: IUserFriendlyViewDescriptor[] };
const viewsExtensionPoint: IExtensionPoint<ViewExtensionPointType> = ExtensionsRegistry.registerExtensionPoint<ViewExtensionPointType>({
	extensionPoint: 'views',
	deps: [viewsContainersExtensionPoint],
	jsonSchema: viewsContribution
});

const TEST_VIEW_CONTAINER_ORDER = 6;
class ViewsExtensionHandler implements IWorkbenchContribution {

	private viewContainersRegistry: IViewContainersRegistry;
	private viewsRegistry: IViewsRegistry;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		this.viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);
		this.handleAndRegisterCustomViewContainers();
		this.handleAndRegisterCustomViews();
	}

	private handleAndRegisterCustomViewContainers() {
		this.registerTestViewContainer();
		viewsContainersExtensionPoint.setHandler((extensions, { added, removed }) => {
			if (removed.length) {
				this.removeCustomViewContainers(removed);
			}
			if (added.length) {
				this.addCustomViewContainers(added, this.viewContainersRegistry.all);
			}
		});
	}

	private addCustomViewContainers(extensionPoints: readonly IExtensionPointUser<ViewContainerExtensionPointType>[], existingViewContainers: ViewContainer[]): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		let order = TEST_VIEW_CONTAINER_ORDER + viewContainersRegistry.all.filter(v => !!v.extensionId).length + 1;
		for (let { value, collector, description } of extensionPoints) {
			forEach(value, entry => {
				if (!this.isValidViewsContainer(entry.value, collector)) {
					return;
				}
				switch (entry.key) {
					case 'activitybar':
						order = this.registerCustomViewContainers(entry.value, description, order, existingViewContainers);
						break;
				}
			});
		}
	}

	private removeCustomViewContainers(extensionPoints: readonly IExtensionPointUser<ViewContainerExtensionPointType>[]): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const removedExtensions: Set<string> = extensionPoints.reduce((result, e) => { result.add(ExtensionIdentifier.toKey(e.description.identifier)); return result; }, new Set<string>());
		for (const viewContainer of viewContainersRegistry.all) {
			if (viewContainer.extensionId && removedExtensions.has(ExtensionIdentifier.toKey(viewContainer.extensionId))) {
				// move only those views that do not belong to the removed extension
				const views = this.viewsRegistry.getViews(viewContainer).filter((view: ICustomViewDescriptor) => !removedExtensions.has(ExtensionIdentifier.toKey(view.extensionId)));
				if (views.length) {
					this.viewsRegistry.moveViews(views, this.getDefaultViewContainer());
				}
				this.deregisterCustomViewContainer(viewContainer);
			}
		}
	}

	private registerTestViewContainer(): void {
		const title = localize('test', "Test");
		const cssClass = `extensionViewlet-test`;
		const icon = URI.parse(require.toUrl('./media/test.svg'));

		this.registerCustomViewContainer(TEST_VIEW_CONTAINER_ID, title, icon, TEST_VIEW_CONTAINER_ORDER, cssClass, undefined);
	}

	private isValidViewsContainer(viewsContainersDescriptors: IUserFriendlyViewsContainerDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(viewsContainersDescriptors)) {
			collector.error(localize('viewcontainer requirearray', "views containers must be an array"));
			return false;
		}

		for (let descriptor of viewsContainersDescriptors) {
			if (typeof descriptor.id !== 'string') {
				collector.error(localize('requireidstring', "property `{0}` is mandatory and must be of type `string`. Only alphanumeric characters, '_', and '-' are allowed.", 'id'));
				return false;
			}
			if (!(/^[a-z0-9_-]+$/i.test(descriptor.id))) {
				collector.error(localize('requireidstring', "property `{0}` is mandatory and must be of type `string`. Only alphanumeric characters, '_', and '-' are allowed.", 'id'));
				return false;
			}
			if (typeof descriptor.title !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
				return false;
			}
			if (typeof descriptor.icon !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'icon'));
				return false;
			}
		}

		return true;
	}

	private registerCustomViewContainers(containers: IUserFriendlyViewsContainerDescriptor[], extension: IExtensionDescription, order: number, existingViewContainers: ViewContainer[]): number {
		containers.forEach(descriptor => {
			const cssClass = `extensionViewlet-${descriptor.id}`;
			const icon = resources.joinPath(extension.extensionLocation, descriptor.icon);
			const id = `workbench.view.extension.${descriptor.id}`;
			const viewContainer = this.registerCustomViewContainer(id, descriptor.title, icon, order++, cssClass, extension.identifier);

			// Move those views that belongs to this container
			if (existingViewContainers.length) {
				const viewsToMove: IViewDescriptor[] = [];
				for (const existingViewContainer of existingViewContainers) {
					if (viewContainer !== existingViewContainer) {
						viewsToMove.push(...this.viewsRegistry.getViews(existingViewContainer).filter((view: ICustomViewDescriptor) => view.originalContainerId === descriptor.id));
					}
				}
				if (viewsToMove.length) {
					this.viewsRegistry.moveViews(viewsToMove, viewContainer);
				}
			}
		});
		return order;
	}

	private registerCustomViewContainer(id: string, title: string, icon: URI, order: number, cssClass: string, extensionId: ExtensionIdentifier | undefined): ViewContainer {
		let viewContainer = this.viewContainersRegistry.get(id);

		if (!viewContainer) {

			viewContainer = this.viewContainersRegistry.registerViewContainer(id, true, extensionId);

			// Register as viewlet
			class CustomViewlet extends ViewContainerViewlet {
				constructor(
					@IConfigurationService configurationService: IConfigurationService,
					@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
					@ITelemetryService telemetryService: ITelemetryService,
					@IWorkspaceContextService contextService: IWorkspaceContextService,
					@IStorageService storageService: IStorageService,
					@IEditorService editorService: IEditorService,
					@IInstantiationService instantiationService: IInstantiationService,
					@IThemeService themeService: IThemeService,
					@IContextMenuService contextMenuService: IContextMenuService,
					@IExtensionService extensionService: IExtensionService
				) {
					super(id, `${id}.state`, true, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
				}
			}
			const viewletDescriptor = new ViewletDescriptor(
				CustomViewlet,
				id,
				title,
				cssClass,
				order,
				icon
			);

			Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(viewletDescriptor);

			// Register Action to Open Viewlet
			class OpenCustomViewletAction extends ShowViewletAction {
				constructor(
					id: string, label: string,
					@IViewletService viewletService: IViewletService,
					@IEditorGroupsService editorGroupService: IEditorGroupsService,
					@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
				) {
					super(id, label, id, viewletService, editorGroupService, layoutService);
				}
			}
			const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
			registry.registerWorkbenchAction(
				new SyncActionDescriptor(OpenCustomViewletAction, id, localize('showViewlet', "Show {0}", title)),
				`View: Show ${title}`,
				localize('view', "View")
			);

			// Generate CSS to show the icon in the activity bar
			const iconClass = `.monaco-workbench .activitybar .monaco-action-bar .action-label.${cssClass}`;
			createCSSRule(iconClass, `-webkit-mask: ${asCSSUrl(icon)} no-repeat 50% 50%; -webkit-mask-size: 24px;`);
		}

		return viewContainer;
	}

	private deregisterCustomViewContainer(viewContainer: ViewContainer): void {
		this.viewContainersRegistry.deregisterViewContainer(viewContainer);
		Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).deregisterViewlet(viewContainer.id);
	}

	private handleAndRegisterCustomViews() {
		viewsExtensionPoint.setHandler((extensions, { added, removed }) => {
			if (removed.length) {
				this.removeViews(removed);
			}
			if (added.length) {
				this.addViews(added);
			}
		});
	}

	private addViews(extensions: readonly IExtensionPointUser<ViewExtensionPointType>[]): void {
		for (const extension of extensions) {
			const { value, collector } = extension;

			forEach(value, entry => {
				if (!this.isValidViewDescriptors(entry.value, collector)) {
					return;
				}

				if (entry.key === 'remote' && !extension.description.enableProposedApi) {
					collector.warn(localize('ViewContainerRequiresProposedAPI', "View container '{0}' requires 'enableProposedApi' turned on to be added to 'Remote'.", entry.key));
					return;
				}

				const viewContainer = this.getViewContainer(entry.key);
				if (!viewContainer) {
					collector.warn(localize('ViewContainerDoesnotExist', "View container '{0}' does not exist and all views registered to it will be added to 'Explorer'.", entry.key));
				}
				const container = viewContainer || this.getDefaultViewContainer();
				const registeredViews = this.viewsRegistry.getViews(container);
				const viewIds: string[] = [];
				const viewDescriptors = coalesce(entry.value.map((item, index) => {
					// validate
					if (viewIds.indexOf(item.id) !== -1) {
						collector.error(localize('duplicateView1', "Cannot register multiple views with same id `{0}` in the view container `{1}`", item.id, container.id));
						return null;
					}
					if (registeredViews.some(v => v.id === item.id)) {
						collector.error(localize('duplicateView2', "A view with id `{0}` is already registered in the view container `{1}`", item.id, container.id));
						return null;
					}

					const order = ExtensionIdentifier.equals(extension.description.identifier, container.extensionId)
						? index + 1
						: container.orderDelegate
							? container.orderDelegate.getOrder(item.group)
							: undefined;

					const viewDescriptor = <ICustomViewDescriptor>{
						id: item.id,
						name: item.name,
						ctorDescriptor: { ctor: CustomTreeViewPanel },
						when: ContextKeyExpr.deserialize(item.when),
						canToggleVisibility: true,
						collapsed: this.showCollapsed(container),
						treeView: this.instantiationService.createInstance(CustomTreeView, item.id, item.name, container),
						order: order,
						extensionId: extension.description.identifier,
						originalContainerId: entry.key,
						group: item.group
					};

					viewIds.push(viewDescriptor.id);
					return viewDescriptor;
				}));
				this.viewsRegistry.registerViews(viewDescriptors, container);
			});
		}
	}

	private getDefaultViewContainer(): ViewContainer {
		return this.viewContainersRegistry.get(EXPLORER)!;
	}

	private removeViews(extensions: readonly IExtensionPointUser<ViewExtensionPointType>[]): void {
		const removedExtensions: Set<string> = extensions.reduce((result, e) => { result.add(ExtensionIdentifier.toKey(e.description.identifier)); return result; }, new Set<string>());
		for (const viewContainer of this.viewContainersRegistry.all) {
			const removedViews = this.viewsRegistry.getViews(viewContainer).filter((v: ICustomViewDescriptor) => v.extensionId && removedExtensions.has(ExtensionIdentifier.toKey(v.extensionId)));
			if (removedViews.length) {
				this.viewsRegistry.deregisterViews(removedViews, viewContainer);
			}
		}
	}

	private isValidViewDescriptors(viewDescriptors: IUserFriendlyViewDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(viewDescriptors)) {
			collector.error(localize('requirearray', "views must be an array"));
			return false;
		}

		for (let descriptor of viewDescriptors) {
			if (typeof descriptor.id !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'id'));
				return false;
			}
			if (typeof descriptor.name !== 'string') {
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'name'));
				return false;
			}
			if (descriptor.when && typeof descriptor.when !== 'string') {
				collector.error(localize('optstring', "property `{0}` can be omitted or must be of type `string`", 'when'));
				return false;
			}
		}

		return true;
	}

	private getViewContainer(value: string): ViewContainer | undefined {
		switch (value) {
			case 'explorer': return this.viewContainersRegistry.get(EXPLORER);
			case 'debug': return this.viewContainersRegistry.get(DEBUG);
			case 'scm': return this.viewContainersRegistry.get(SCM);
			case 'remote': return this.viewContainersRegistry.get(REMOTE);
			default: return this.viewContainersRegistry.get(`workbench.view.extension.${value}`);
		}
	}

	private showCollapsed(container: ViewContainer): boolean {
		switch (container.id) {
			case EXPLORER:
			case SCM:
			case DEBUG:
				return true;
		}
		return false;
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ViewsExtensionHandler, LifecyclePhase.Starting);
