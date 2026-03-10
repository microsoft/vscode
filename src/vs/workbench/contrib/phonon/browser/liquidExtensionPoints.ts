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
	ILiquidGraftContribution,
	ILiquidDataProviderContribution,
	ILiquidSidebarContribution,
	ILiquidEntity,
	ILiquidView,
	ILiquidGraft,
	ILiquidDataProvider,
	ILiquidSidebarNode,
} from '../common/liquidGraftTypes.js';
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
			defaultGrafts: {
				type: 'array',
				items: { type: 'string' },
				description: nls.localize('phonon.liquid.view.defaultGrafts', "Default graft IDs to compose when this view is selected."),
			},
		},
	},
};

const graftSchema: IJSONSchema = {
	description: nls.localize('phonon.liquid.graft', "Declares a Liquid Module graft (sandboxed HTML webview)."),
	type: 'array',
	items: {
		type: 'object',
		required: ['id', 'label', 'entry'],
		properties: {
			id: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.id', "Unique identifier for this graft."),
			},
			label: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.label', "Human-readable label for this graft."),
			},
			description: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.description', "Human-readable description for AI and developer tooling."),
			},
			entry: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.entry', "Relative path to the graft's HTML entry file within the extension."),
			},
			entity: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.entity', "Entity this graft displays data for."),
			},
			domain: {
				type: 'string',
				description: nls.localize('phonon.liquid.graft.domain', "Business domain this graft belongs to (e.g. inventory, orders, analytics)."),
			},
			category: {
				type: 'string',
				enum: ['stat', 'table', 'detail', 'chart', 'form', 'list'],
				description: nls.localize('phonon.liquid.graft.category', "UI purpose category for this graft."),
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: nls.localize('phonon.liquid.graft.tags', "Tags for AI-driven composition (e.g. analytics, cost, dashboard)."),
			},
			layout: {
				type: 'object',
				description: nls.localize('phonon.liquid.graft.layout', "Grid layout constraints for this graft."),
				properties: {
					minCols: {
						type: 'number',
						description: nls.localize('phonon.liquid.graft.layout.minCols', "Minimum grid columns (default 4)."),
					},
					maxCols: {
						type: 'number',
						description: nls.localize('phonon.liquid.graft.layout.maxCols', "Maximum grid columns (default 12)."),
					},
					minHeight: {
						type: 'number',
						description: nls.localize('phonon.liquid.graft.layout.minHeight', "Minimum height in pixels (default 150)."),
					},
				},
			},
			shows: {
				type: 'array',
				items: { type: 'string' },
				description: nls.localize('phonon.liquid.graft.shows', "Entity IDs this graft can visualise."),
			},
			relatesTo: {
				type: 'array',
				items: { type: 'string' },
				description: nls.localize('phonon.liquid.graft.relatesTo', "IDs of related grafts or entities for composition hints."),
			},
			tokenWeight: {
				type: 'number',
				description: nls.localize('phonon.liquid.graft.tokenWeight', "Approximate token weight for AI context budgeting."),
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

const liquidGraftsExtPoint = ExtensionsRegistry.registerExtensionPoint<ILiquidGraftContribution[]>({
	extensionPoint: 'liquidGrafts',
	jsonSchema: graftSchema,
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
 * Registers handlers on the five Liquid extension points that resolve
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
					defaultGrafts: Object.freeze([...(contrib.defaultGrafts ?? [])]),
					extensionId,
				});
			}
		}
		registry.updateViews(resolved);
	});

	liquidGraftsExtPoint.setHandler((extensions: readonly IExtensionPointUser<ILiquidGraftContribution[]>[]) => {
		const resolved: ILiquidGraft[] = [];
		for (const ext of extensions) {
			const extensionId = ext.description.identifier.value;
			for (const contrib of ext.value) {
				resolved.push({
					id: contrib.id,
					label: contrib.label,
					description: contrib.description ?? '',
					entryUri: URI.joinPath(ext.description.extensionLocation, contrib.entry),
					entity: contrib.entity,
					domain: contrib.domain ?? 'general',
					category: contrib.category ?? 'detail',
					tags: Object.freeze([...(contrib.tags ?? [])]),
					layout: { minCols: contrib.layout?.minCols ?? 4, maxCols: contrib.layout?.maxCols ?? 12, minHeight: contrib.layout?.minHeight ?? 150 },
					extensionId,
					shows: Object.freeze([...(contrib.shows ?? [])]),
					relatesTo: Object.freeze([...(contrib.relatesTo ?? [])]),
					tokenWeight: contrib.tokenWeight ?? 0,
				});
			}
		}
		registry.updateGrafts(resolved);
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
					priority: contrib.priority ?? 0,
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
