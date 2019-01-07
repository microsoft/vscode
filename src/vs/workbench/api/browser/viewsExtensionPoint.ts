/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { forEach } from 'vs/base/common/collections';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ViewContainer, ViewsRegistry, ICustomViewDescriptor, IViewContainersRegistry, Extensions as ViewContainerExtensions } from 'vs/workbench/common/views';
import { CustomTreeViewPanel, CustomTreeView } from 'vs/workbench/browser/parts/views/customView';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { coalesce, } from 'vs/base/common/arrays';
import { viewsContainersExtensionPoint } from 'vs/workbench/api/browser/viewsContainersExtensionPoint';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { VIEWLET_ID as EXPLORER } from 'vs/workbench/parts/files/common/files';
import { VIEWLET_ID as SCM } from 'vs/workbench/parts/scm/common/scm';
import { VIEWLET_ID as DEBUG } from 'vs/workbench/parts/debug/common/debug';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

interface IUserFriendlyViewDescriptor {
	id: string;
	name: string;
	when?: string;
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
		}
	},
	additionalProperties: {
		description: localize('views.contributed', "Contributes views to contributed views container"),
		type: 'array',
		items: viewDescriptor,
		default: []
	}
};


const viewsExtensionPoint: IExtensionPoint<{ [loc: string]: IUserFriendlyViewDescriptor[] }> = ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: IUserFriendlyViewDescriptor[] }>({
	extensionPoint: 'views',
	deps: [viewsContainersExtensionPoint],
	jsonSchema: viewsContribution
});

class ViewsContainersExtensionHandler implements IWorkbenchContribution {

	private viewContainersRegistry: IViewContainersRegistry;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		this.viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		this.handleAndRegisterCustomViews();
	}

	private handleAndRegisterCustomViews() {
		viewsExtensionPoint.setHandler(extensions => {
			for (let extension of extensions) {
				const { value, collector } = extension;

				forEach(value, entry => {
					if (!this.isValidViewDescriptors(entry.value, collector)) {
						return;
					}

					let container = this.getViewContainer(entry.key);
					if (!container) {
						collector.warn(localize('ViewContainerDoesnotExist', "View container '{0}' does not exist and all views registered to it will be added to 'Explorer'.", entry.key));
						container = this.viewContainersRegistry.get(EXPLORER);
					}
					const registeredViews = ViewsRegistry.getViews(container);
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

						const viewDescriptor = <ICustomViewDescriptor>{
							id: item.id,
							name: item.name,
							ctor: CustomTreeViewPanel,
							container,
							when: ContextKeyExpr.deserialize(item.when),
							canToggleVisibility: true,
							collapsed: this.showCollapsed(container),
							treeView: this.instantiationService.createInstance(CustomTreeView, item.id, container),
							order: ExtensionIdentifier.equals(extension.description.identifier, container.extensionId) ? index + 1 : undefined
						};

						viewIds.push(viewDescriptor.id);
						return viewDescriptor;
					}));
					ViewsRegistry.registerViews(viewDescriptors);
				});
			}
		});
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


	private getViewContainer(value: string): ViewContainer {
		switch (value) {
			case 'explorer': return this.viewContainersRegistry.get(EXPLORER);
			case 'debug': return this.viewContainersRegistry.get(DEBUG);
			case 'scm': return this.viewContainersRegistry.get(SCM);
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
workbenchRegistry.registerWorkbenchContribution(ViewsContainersExtensionHandler, LifecyclePhase.Starting);