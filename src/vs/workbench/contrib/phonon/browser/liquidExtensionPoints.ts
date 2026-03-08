/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { ExtensionsRegistry, type IExtensionPointUser } from '../../../services/extensions/common/extensionsRegistry.js';
import type {
	ILiquidEntityContribution,
	ILiquidViewContribution,
	ILiquidDataProviderContribution,
	ILiquidSidebarContribution,
	ILiquidEntity,
	ILiquidView,
	ILiquidDataProvider,
	ILiquidSidebarNode,
} from '../common/liquidModuleTypes.js';
import type { LiquidModuleRegistry } from './liquidModuleRegistry.js';

// ==================== JSON Schemas ====================

const entitySchema: IJSONSchema = {
	description: nls.localize('phonon.liquid.entity', "Declares a Liquid Module data entity."),
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'label', 'schema'],
		properties: {
			id: {
				type: 'string',
				description: nls.localize('phonon.liquid.entity.id', "Unique identifier for this entity."),
			},
			label: {
				type: 'string',
				description: nls.localize('phonon.liquid.entity.label', "Human-readable label for this entity."),
			},
			schema: {
				type: 'string',
				description: nls.localize('phonon.liquid.entity.schema', "Relative path to the JSON Schema file within the extension."),
			},
			icon: {
				type: 'string',
				description: nls.localize('phonon.liquid.entity.icon', "Optional icon identifier for this entity."),
			},
		},
	},
};

const viewSchema: IJSONSchema = {
	description: nls.localize('phonon.liquid.view', "Declares a Liquid Module UI view."),
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'label', 'component', 'mode'],
		properties: {
			id: {
				type: 'string',
				description: nls.localize('phonon.liquid.view.id', "Unique identifier for this view."),
			},
			label: {
				type: 'string',
				description: nls.localize('phonon.liquid.view.label', "Human-readable label for this view."),
			},
			component: {
				type: 'string',
				description: nls.localize('phonon.liquid.view.component', "Relative path to the component module within the extension."),
			},
			mode: {
				type: 'string',
				enum: ['structured', 'canvas'],
				description: nls.localize('phonon.liquid.view.mode', "Rendering mode: structured (fixed layout) or canvas (composable)."),
			},
			entity: {
				type: 'string',
				description: nls.localize('phonon.liquid.view.entity', "Entity this view is bound to. Omit for entity-agnostic views."),
			},
		},
	},
};

const dataProviderSchema: IJSONSchema = {
	description: nls.localize('phonon.liquid.dataProvider', "Declares a Liquid Module data provider."),
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'entities', 'provider'],
		properties: {
			id: {
				type: 'string',
				description: nls.localize('phonon.liquid.dataProvider.id', "Unique identifier for this data provider."),
			},
			entities: {
				type: 'array',
				items: { type: 'string' },
				description: nls.localize('phonon.liquid.dataProvider.entities', "Entity IDs this provider supplies data for."),
			},
			provider: {
				type: 'string',
				description: nls.localize('phonon.liquid.dataProvider.provider', "Relative path to the provider module within the extension."),
			},
		},
	},
};

const sidebarNodeSchema: IJSONSchema = {
	description: nls.localize('phonon.liquid.sidebar', "Declares Liquid Module sidebar navigation nodes."),
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'label'],
		properties: {
			id: {
				type: 'string',
				description: nls.localize('phonon.liquid.sidebar.id', "Unique identifier for this sidebar node."),
			},
			label: {
				type: 'string',
				description: nls.localize('phonon.liquid.sidebar.label', "Display label for this sidebar node."),
			},
			view: {
				type: 'string',
				description: nls.localize('phonon.liquid.sidebar.view', "View to activate when this node is selected."),
			},
			icon: {
				type: 'string',
				description: nls.localize('phonon.liquid.sidebar.icon', "Optional icon identifier."),
			},
			order: {
				type: 'number',
				description: nls.localize('phonon.liquid.sidebar.order', "Sort order (lower values appear first, default 99)."),
			},
			children: {
				type: 'array',
				description: nls.localize('phonon.liquid.sidebar.children', "Child nodes forming a navigation subtree."),
				items: { $ref: '#' },
			},
		},
	},
};

// ==================== Extension Point Registration ====================

const liquidEntitiesExtPoint = ExtensionsRegistry.registerExtensionPoint<ILiquidEntityContribution[]>({
	extensionPoint: 'liquidEntities',
	jsonSchema: entitySchema,
});

const liquidViewsExtPoint = ExtensionsRegistry.registerExtensionPoint<ILiquidViewContribution[]>({
	extensionPoint: 'liquidViews',
	jsonSchema: viewSchema,
});

const liquidDataProvidersExtPoint = ExtensionsRegistry.registerExtensionPoint<ILiquidDataProviderContribution[]>({
	extensionPoint: 'liquidDataProviders',
	jsonSchema: dataProviderSchema,
});

const liquidSidebarExtPoint = ExtensionsRegistry.registerExtensionPoint<ILiquidSidebarContribution[]>({
	extensionPoint: 'liquidSidebar',
	jsonSchema: sidebarNodeSchema,
});

// ==================== Handlers ====================

function resolveSidebarNode(contrib: ILiquidSidebarContribution, extensionId: string): ILiquidSidebarNode {
	return {
		id: contrib.id,
		label: contrib.label,
		view: contrib.view,
		icon: contrib.icon,
		order: contrib.order ?? 99,
		children: (contrib.children ?? []).map(child => resolveSidebarNode(child, extensionId)),
		extensionId,
	};
}

/**
 * Registers handlers on the four Liquid extension points that resolve
 * contributions into the registry's resolved types and push them through.
 */
export function registerLiquidExtensionPointHandlers(registry: LiquidModuleRegistry): void {

	liquidEntitiesExtPoint.setHandler((extensions: readonly IExtensionPointUser<ILiquidEntityContribution[]>[]) => {
		const resolved: ILiquidEntity[] = [];
		for (const ext of extensions) {
			const extensionId = ext.description.identifier.value;
			for (const contrib of ext.value) {
				resolved.push({
					id: contrib.id,
					label: contrib.label,
					schema: contrib.schema ? { $ref: URI.joinPath(ext.description.extensionLocation, contrib.schema).toString() } : {},
					icon: contrib.icon,
					extensionId,
				});
			}
		}
		registry.updateEntities(resolved);
	});

	liquidViewsExtPoint.setHandler((extensions: readonly IExtensionPointUser<ILiquidViewContribution[]>[]) => {
		const resolved: ILiquidView[] = [];
		for (const ext of extensions) {
			const extensionId = ext.description.identifier.value;
			for (const contrib of ext.value) {
				resolved.push({
					id: contrib.id,
					label: contrib.label,
					componentUri: URI.joinPath(ext.description.extensionLocation, contrib.component),
					mode: contrib.mode,
					entity: contrib.entity,
					extensionId,
				});
			}
		}
		registry.updateViews(resolved);
	});

	liquidDataProvidersExtPoint.setHandler((extensions: readonly IExtensionPointUser<ILiquidDataProviderContribution[]>[]) => {
		const resolved: ILiquidDataProvider[] = [];
		for (const ext of extensions) {
			const extensionId = ext.description.identifier.value;
			for (const contrib of ext.value) {
				resolved.push({
					id: contrib.id,
					entities: Object.freeze([...contrib.entities]),
					extensionId,
				});
			}
		}
		registry.updateDataProviders(resolved);
	});

	liquidSidebarExtPoint.setHandler((extensions: readonly IExtensionPointUser<ILiquidSidebarContribution[]>[]) => {
		const resolved: ILiquidSidebarNode[] = [];
		for (const ext of extensions) {
			const extensionId = ext.description.identifier.value;
			for (const contrib of ext.value) {
				resolved.push(resolveSidebarNode(contrib, extensionId));
			}
		}
		registry.updateSidebar(resolved);
	});
}
