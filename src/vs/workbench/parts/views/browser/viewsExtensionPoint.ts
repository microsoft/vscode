/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { forEach } from 'vs/base/common/collections';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ViewLocation, ViewsRegistry } from 'vs/workbench/parts/views/browser/views';
import { TreeView } from 'vs/workbench/parts/views/browser/treeView';

namespace schema {

	// --views contribution point

	export interface IUserFriendlyViewDescriptor {
		id: string;
		name: string;
	}

	export function parseLocation(value: string): ViewLocation {
		switch (value) {
			case ViewLocation.Explorer.id: return ViewLocation.Explorer;
		}
		return void 0;
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
				collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'label'));
				return false;
			}
		}

		return true;
	}

	const viewDescriptor: IJSONSchema = {
		type: 'object',
		properties: {
			id: {
				description: localize('vscode.extension.contributes.view.id', 'Identifier of the view. Use the same identifier to register a data provider through API.'),
				type: 'string'
			},
			name: {
				description: localize('vscode.extension.contributes.view.name', 'The human-readable name of the view. Will be shown'),
				type: 'string'
			}
		}
	};

	export const viewsContribution: IJSONSchema = {
		description: localize('vscode.extension.contributes.views', "Contributes views to the editor"),
		type: 'object',
		properties: {
			'explorer': {
				description: localize('views.explorer', "Explorer"),
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

			const location = schema.parseLocation(entry.key);
			if (!location) {
				collector.warn(localize('locationId.invalid', "`{0}` is not a valid view location", entry.key));
				return;
			}

			const viewDescriptors = entry.value.map(item => ({
				id: item.id,
				name: item.name,
				ctor: TreeView,
				location
			}));
			ViewsRegistry.registerViews(viewDescriptors);
		});
	}
});