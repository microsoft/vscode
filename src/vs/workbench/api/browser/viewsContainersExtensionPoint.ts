/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import * as resources from 'vs/base/common/resources';
import { createCSSRule } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions, ShowViewletAction } from 'vs/workbench/browser/viewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService, IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, TEST_VIEW_CONTAINER_ID } from 'vs/workbench/common/views';
import { ViewContainerViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { forEach } from 'vs/base/common/collections';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export interface IUserFriendlyViewsContainerDescriptor {
	id: string;
	title: string;
	icon: string;
}

export interface IUserFriendlyViewsContainerDescriptor2 {
	id: string;
	title: string;
	icon: URI;
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

export const viewsContainersExtensionPoint: IExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }> = ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }>({
	extensionPoint: 'viewsContainers',
	jsonSchema: viewsContainersContribution
});

const TEST_VIEW_CONTAINER_ORDER = 6;

class ViewsContainersExtensionHandler implements IWorkbenchContribution {

	constructor() {
		this.registerTestViewContainer();
		this.handleAndRegisterCustomViewContainers();
	}

	private registerTestViewContainer(): void {
		const title = localize('test', "Test");
		const cssClass = `extensionViewlet-test`;
		const icon = URI.parse(require.toUrl('./media/test.svg'));

		this.registerCustomViewlet({ id: TEST_VIEW_CONTAINER_ID, title, icon }, TEST_VIEW_CONTAINER_ORDER, cssClass, undefined);
	}

	private handleAndRegisterCustomViewContainers() {
		let order = TEST_VIEW_CONTAINER_ORDER + 1;
		viewsContainersExtensionPoint.setHandler((extensions) => {
			for (let extension of extensions) {
				const { value, collector } = extension;
				forEach(value, entry => {
					if (!this.isValidViewsContainer(entry.value, collector)) {
						return;
					}
					switch (entry.key) {
						case 'activitybar':
							order = this.registerCustomViewContainers(entry.value, extension.description, order);
							break;
					}
				});
			}
		});
	}

	private isValidViewsContainer(viewsContainersDescriptors: IUserFriendlyViewsContainerDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(viewsContainersDescriptors)) {
			collector.error(localize('requirearray', "views containers must be an array"));
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

	private registerCustomViewContainers(containers: IUserFriendlyViewsContainerDescriptor[], extension: IExtensionDescription, order: number): number {
		containers.forEach(descriptor => {
			const cssClass = `extensionViewlet-${descriptor.id}`;
			const icon = resources.joinPath(extension.extensionLocation, descriptor.icon);
			this.registerCustomViewlet({ id: `workbench.view.extension.${descriptor.id}`, title: descriptor.title, icon }, order++, cssClass, extension.identifier);
		});
		return order;
	}

	private registerCustomViewlet(descriptor: IUserFriendlyViewsContainerDescriptor2, order: number, cssClass: string, extensionId: ExtensionIdentifier): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);
		const id = descriptor.id;

		if (!viewletRegistry.getViewlet(id)) {

			viewContainersRegistry.registerViewContainer(id, extensionId);

			// Register as viewlet
			class CustomViewlet extends ViewContainerViewlet {
				constructor(
					@IConfigurationService configurationService: IConfigurationService,
					@IPartService partService: IPartService,
					@ITelemetryService telemetryService: ITelemetryService,
					@IWorkspaceContextService contextService: IWorkspaceContextService,
					@IStorageService storageService: IStorageService,
					@IEditorService editorService: IEditorService,
					@IInstantiationService instantiationService: IInstantiationService,
					@IThemeService themeService: IThemeService,
					@IContextMenuService contextMenuService: IContextMenuService,
					@IExtensionService extensionService: IExtensionService
				) {
					super(id, `${id}.state`, true, configurationService, partService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
				}
			}
			const viewletDescriptor = new ViewletDescriptor(
				CustomViewlet,
				id,
				descriptor.title,
				cssClass,
				order,
				descriptor.icon
			);

			viewletRegistry.registerViewlet(viewletDescriptor);

			// Register Action to Open Viewlet
			class OpenCustomViewletAction extends ShowViewletAction {
				constructor(
					id: string, label: string,
					@IViewletService viewletService: IViewletService,
					@IEditorGroupsService editorGroupService: IEditorGroupsService,
					@IPartService partService: IPartService
				) {
					super(id, label, id, viewletService, editorGroupService, partService);
				}
			}
			const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
			registry.registerWorkbenchAction(
				new SyncActionDescriptor(OpenCustomViewletAction, id, localize('showViewlet', "Show {0}", descriptor.title)),
				'View: Show {0}',
				localize('view', "View")
			);

			// Generate CSS to show the icon in the activity bar
			const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${cssClass}`;
			createCSSRule(iconClass, `-webkit-mask: url('${descriptor.icon}') no-repeat 50% 50%`);
		}

	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ViewsContainersExtensionHandler, LifecyclePhase.Starting);
