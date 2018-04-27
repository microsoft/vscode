/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { join } from 'vs/base/common/paths';
import { createCSSRule } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ViewletDescriptor, ViewletRegistry, Extensions as ViewletExtensions, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionService, IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ViewLocation } from 'vs/workbench/common/views';
import { PersistentViewsViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { forEach } from 'vs/base/common/collections';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';


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
			description: localize('vscode.extension.contributes.views.containers.icon', "Path to the container icon. Icons are 24x24 centered on a 50x40 square and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted."),
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

export const viewsContainersExtensionPoint: IExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }> = ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }>('viewsContainers', [], viewsContainersContribution);

const TEST_VIEW_CONTAINER_ORDER = 6;

class ViewsContainersExtensionHandler implements IWorkbenchContribution {

	constructor() {
		this.registerTestViewContainer();
		this.handleAndRegisterCustomViewContainers();
	}

	private registerTestViewContainer(): void {
		const id = 'test';
		const title = localize('test', "Test");
		const cssClass = `extensionViewlet-${id}`;
		const icon = require.toUrl('./media/test.svg');

		this.registerCustomViewlet({ id, title, icon }, TEST_VIEW_CONTAINER_ORDER, cssClass);
	}

	private handleAndRegisterCustomViewContainers() {
		viewsContainersExtensionPoint.setHandler((extensions) => {
			for (let extension of extensions) {
				const { value, collector } = extension;
				forEach(value, entry => {
					if (!this.isValidViewsContainer(entry.value, collector)) {
						return;
					}
					switch (entry.key) {
						case 'activitybar':
							this.registerCustomViewContainers(entry.value, extension.description);
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

	private registerCustomViewContainers(containers: IUserFriendlyViewsContainerDescriptor[], extension: IExtensionDescription) {
		containers.forEach((descriptor, index) => {
			const cssClass = `extensionViewlet-${descriptor.id}`;
			const icon = join(extension.extensionFolderPath, descriptor.icon);
			this.registerCustomViewlet({ id: descriptor.id, title: descriptor.title, icon }, TEST_VIEW_CONTAINER_ORDER + index + 1, cssClass);
		});
	}

	private registerCustomViewlet(descriptor: IUserFriendlyViewsContainerDescriptor, order: number, cssClass: string): void {
		const viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);
		const id = `workbench.view.extension.${descriptor.id}`;

		if (!viewletRegistry.getViewlet(id)) {

			const location: ViewLocation = ViewLocation.register(id);

			// Register as viewlet
			class CustomViewlet extends PersistentViewsViewlet {
				constructor(
					@IPartService partService: IPartService,
					@ITelemetryService telemetryService: ITelemetryService,
					@IWorkspaceContextService contextService: IWorkspaceContextService,
					@IStorageService storageService: IStorageService,
					@IWorkbenchEditorService editorService: IWorkbenchEditorService,
					@IInstantiationService instantiationService: IInstantiationService,
					@IContextKeyService contextKeyService: IContextKeyService,
					@IThemeService themeService: IThemeService,
					@IContextMenuService contextMenuService: IContextMenuService,
					@IExtensionService extensionService: IExtensionService
				) {
					super(id, location, `${id}.state`, true, partService, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);
				}
			}
			const viewletDescriptor = new ViewletDescriptor(
				CustomViewlet,
				id,
				descriptor.title,
				cssClass,
				order
			);

			viewletRegistry.registerViewlet(viewletDescriptor);

			// Register Action to Open Viewlet
			class OpenCustomViewletAction extends ToggleViewletAction {
				constructor(
					id: string, label: string,
					@IViewletService viewletService: IViewletService,
					@IWorkbenchEditorService editorService: IWorkbenchEditorService
				) {
					super(id, label, id, viewletService, editorService);
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