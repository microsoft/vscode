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
			type: 'string'
		},
		label: {
			description: localize('vscode.extension.contributes.views.containers.title', 'Human readable string used to render the container'),
			type: 'string'
		},
		icon: {
			description: localize('vscode.extension.contributes.views.containers.icon', 'Path to the container icon'),
			type: 'string'
		}
	}
};

export const viewsContainerContribution: IJSONSchema = {
	description: localize('vscode.extension.contributes.viewsContainer', 'Contributes views containers to the editor'),
	type: 'object',
	properties: {
		'activitybar': {
			description: localize('views.container.activitybar', "Contribute views containers to Activity Bar"),
			type: 'array',
			items: viewsContainerSchema
		}
	}
};

export const viewsContainersExtensionPoint: IExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }> = ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: IUserFriendlyViewsContainerDescriptor[] }>('viewsContainers', [], viewsContainerContribution);
class ViewsContainersExtensionHandler implements IWorkbenchContribution {

	constructor() {
		this.handleViewsContainersExtensionPoint();
	}

	private handleViewsContainersExtensionPoint() {
		viewsContainersExtensionPoint.setHandler((extensions) => {
			for (let extension of extensions) {
				const { value, collector } = extension;
				if (!extension.description.enableProposedApi) {
					collector.error(localize({ key: 'proposed', comment: ['Contribution refers to those that an extension contributes to VS Code through an extension/contribution point. '] }, "'viewsContainer' contribution is only available when running out of dev or with the following command line switch: --enable-proposed-api {0}", extension.description.id));
					continue;
				}
				forEach(value, entry => {
					if (!this.isValidViewsContainer(entry.value, collector)) {
						return;
					}
					switch (entry.key) {
						case 'activitybar':
							this.contributeToActivitybar(entry.value, extension.description);
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
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'id'));
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

	private contributeToActivitybar(containers: IUserFriendlyViewsContainerDescriptor[], extension: IExtensionDescription) {
		containers.forEach((descriptor, index) => {
			const id = `workbench.view.extension.${descriptor.id}`;
			const title = descriptor.title;
			const cssClass = `extensionViewlet-${descriptor.id}`;
			const location: ViewLocation = ViewLocation.register(id);

			// Generate CSS to show the icon in the activity bar
			const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${cssClass}`;
			const iconPath = join(extension.extensionFolderPath, descriptor.icon);
			createCSSRule(iconClass, `-webkit-mask: url('${iconPath}') no-repeat 50% 50%`);

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
				title,
				cssClass,
				6 + index
			);

			Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(viewletDescriptor);

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
				new SyncActionDescriptor(OpenCustomViewletAction, id, localize('showViewlet', "Show {0}", title)),
				'View: Show {0}',
				localize('view', "View")
			);
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ViewsContainersExtensionHandler, LifecyclePhase.Starting);