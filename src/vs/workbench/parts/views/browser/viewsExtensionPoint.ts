/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { forEach } from 'vs/base/common/collections';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ViewLocation, ViewsRegistry, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { TreeView } from 'vs/workbench/parts/views/browser/treeView';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

namespace schema {

	// --views contribution point

	export interface IUserFriendlyViewDescriptor {
		id: string;
		name: string;
		when?: string;
	}

	export function isValidViewDescriptors(viewDescriptors: IUserFriendlyViewDescriptor[], collector: ExtensionMessageCollector): boolean {
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

	export const viewsContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.views', "Contributes views to the editor"),
		type: 'object',
		properties: {
			'explorer': {
				description: localize('views.explorer', "Explorer View"),
				type: 'array',
				items: viewDescriptor
			},
			'debug': {
				description: localize('views.debug', "Debug View"),
				type: 'array',
				items: viewDescriptor
			}
		}
	};
}

ExtensionsRegistry.registerExtensionPoint<{ [loc: string]: schema.IUserFriendlyViewDescriptor[] }>('views', [], schema.viewsContribution).setHandler(extensions => {
	for (let extension of extensions) {
		const { value, collector } = extension;

		forEach(value, entry => {
			if (!schema.isValidViewDescriptors(entry.value, collector)) {
				return;
			}

			const location = ViewLocation.getContributedViewLocation(entry.key);
			if (!location) {
				collector.warn(localize('locationId.invalid', "`{0}` is not a valid view location", entry.key));
				return;
			}

			const viewDescriptors = entry.value.map(item => (<IViewDescriptor>{
				id: item.id,
				name: item.name,
				ctor: TreeView,
				location,
				when: ContextKeyExpr.deserialize(item.when),
				canToggleVisibility: true
			}));
			ViewsRegistry.registerViews(viewDescriptors);
		});
	}
});