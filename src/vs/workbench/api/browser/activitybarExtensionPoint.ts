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
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ViewLocation } from 'vs/workbench/common/views';
import { PersistentViewsViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export namespace schema {

	// --activity group contribution point
	export interface IUserFriendlyActivityGroupDescriptor {
		id: string;
		title: string;
		icon: string;
	}

	export function isValidActivityGroup(activityGroupDescriptors: IUserFriendlyActivityGroupDescriptor[], collector: ExtensionMessageCollector): boolean {
		if (!Array.isArray(activityGroupDescriptors)) {
			collector.error(localize('requirearray', "activity groups must be an array"));
			return false;
		}

		for (let descriptor of activityGroupDescriptors) {
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

	export const activityGroupContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.activityGroup', 'Contributes an activity group to activity bar'),
		type: 'object',
		properties: {
			id: {
				description: localize('vscode.extension.contributes.activityGroup.id', "Unique id used to identify the activity group in which views can be contributed using 'views' contribution point"),
				type: 'string'
			},
			label: {
				description: localize('vscode.extension.contributes.activityGroup.title', 'Human readable string used to render the activity group'),
				type: 'string'
			},
			icon: {
				description: localize('vscode.extension.contributes.activityGroup.icon', 'Path to the activityGroup icon'),
				type: 'string'
			}
		}
	};
}

export const activityGroupExtensionPoint: IExtensionPoint<schema.IUserFriendlyActivityGroupDescriptor[]> = ExtensionsRegistry.registerExtensionPoint<schema.IUserFriendlyActivityGroupDescriptor[]>('activityGroups', [], schema.activityGroupContribution);
activityGroupExtensionPoint.setHandler((extensions) => {
	for (let extension of extensions) {
		const { value, collector } = extension;
		if (!schema.isValidActivityGroup(value, collector)) {
			return;
		}
		value.forEach(descriptor => {
			const id = `workbench.view.extension.${descriptor.id}`;
			const title = descriptor.title;
			const cssClass = `extensionViewlet-${descriptor.id}`;
			const location: ViewLocation = ViewLocation.register(id);

			// Generate CSS to show the icon in the activity bar
			const iconClass = `.monaco-workbench > .activitybar .monaco-action-bar .action-label.${cssClass}`;
			const iconPath = join(extension.description.extensionFolderPath, descriptor.icon);
			createCSSRule(iconClass, `-webkit-mask: url('${iconPath}') no-repeat 50% 50%; -webkit-mask-size: contain;`);

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
				-1
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
});
