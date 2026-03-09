/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type {
	ILiquidEntityContribution,
	ILiquidViewContribution,
	ILiquidMoleculeContribution,
	ILiquidDataProviderContribution,
	ILiquidSidebarContribution,
	ILiquidEntity,
	ILiquidView,
	ILiquidMolecule,
	ILiquidDataProvider,
	ILiquidSidebarNode,
	CompositionLayout,
	ICompositionSlot,
	ICompositionIntent,
	ILiquidCapabilitySummary,
	ComponentCategory,
} from '../../common/liquidModuleTypes.js';

suite('LiquidModuleTypes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ==================== Contribution Types ====================

	suite('ILiquidEntityContribution', () => {
		test('accepts valid contribution with all fields', () => {
			const contribution: ILiquidEntityContribution = {
				id: 'ristorante.tavolo',
				label: 'Tavolo',
				schema: './schemas/tavolo.json',
				icon: 'table',
			};
			assert.deepStrictEqual(contribution, {
				id: 'ristorante.tavolo',
				label: 'Tavolo',
				schema: './schemas/tavolo.json',
				icon: 'table',
			});
		});

		test('accepts contribution without optional icon', () => {
			const contribution: ILiquidEntityContribution = {
				id: 'ristorante.ordine',
				label: 'Ordine',
				schema: './schemas/ordine.json',
			};
			assert.strictEqual(contribution.icon, undefined);
		});
	});

	suite('ILiquidViewContribution', () => {
		test('accepts structured view bound to entity', () => {
			const contribution: ILiquidViewContribution = {
				id: 'ristorante.tavoli-view',
				label: 'Tavoli',
				component: './views/tavoli.js',
				mode: 'structured',
				entity: 'ristorante.tavolo',
			};
			assert.strictEqual(contribution.mode, 'structured');
			assert.strictEqual(contribution.entity, 'ristorante.tavolo');
		});

		test('accepts canvas view without entity binding', () => {
			const contribution: ILiquidViewContribution = {
				id: 'ristorante.dashboard',
				label: 'Dashboard',
				component: './views/dashboard.js',
				mode: 'canvas',
			};
			assert.strictEqual(contribution.mode, 'canvas');
			assert.strictEqual(contribution.entity, undefined);
		});
	});

	suite('ILiquidMoleculeContribution', () => {
		test('accepts molecule with all fields', () => {
			const contribution: ILiquidMoleculeContribution = {
				id: 'ristorante.costi-molecule',
				label: 'Costi',
				description: 'Analisi costi piatti',
				entry: './molecules/costi.html',
				entity: 'ristorante.ordine',
				domain: 'analytics',
				category: 'stat',
				tags: ['analytics', 'cost'],
				layout: { minCols: 4, maxCols: 12, minHeight: 150 },
				shows: ['ristorante.ordine', 'ristorante.costo'],
				relatesTo: ['ristorante.revenue-molecule'],
			};
			assert.strictEqual(contribution.entry, './molecules/costi.html');
			assert.strictEqual(contribution.tags?.length, 2);
			assert.strictEqual(contribution.category, 'stat');
			assert.strictEqual(contribution.domain, 'analytics');
			assert.strictEqual(contribution.shows?.length, 2);
			assert.strictEqual(contribution.relatesTo?.length, 1);
		});

		test('accepts minimal molecule without optional fields', () => {
			const contribution: ILiquidMoleculeContribution = {
				id: 'ristorante.info-molecule',
				label: 'Info',
				entry: './molecules/info.html',
			};
			assert.strictEqual(contribution.entity, undefined);
			assert.strictEqual(contribution.tags, undefined);
			assert.strictEqual(contribution.layout, undefined);
			assert.strictEqual(contribution.description, undefined);
			assert.strictEqual(contribution.domain, undefined);
			assert.strictEqual(contribution.category, undefined);
		});
	});

	suite('ILiquidDataProviderContribution', () => {
		test('accepts provider for multiple entities', () => {
			const contribution: ILiquidDataProviderContribution = {
				id: 'ristorante.supabase-provider',
				entities: ['ristorante.tavolo', 'ristorante.ordine', 'ristorante.cliente'],
				provider: './providers/supabase.js',
			};
			assert.strictEqual(contribution.entities.length, 3);
		});
	});

	suite('ILiquidSidebarContribution', () => {
		test('accepts flat sidebar node', () => {
			const contribution: ILiquidSidebarContribution = {
				id: 'ristorante.nav-tavoli',
				label: 'Tavoli',
				view: 'ristorante.tavoli-view',
				icon: 'table',
				order: 1,
			};
			assert.strictEqual(contribution.view, 'ristorante.tavoli-view');
		});

		test('accepts nested sidebar tree', () => {
			const contribution: ILiquidSidebarContribution = {
				id: 'ristorante.nav-root',
				label: 'Ristorante',
				icon: 'restaurant',
				order: 0,
				children: [
					{ id: 'ristorante.nav-tavoli', label: 'Tavoli', view: 'ristorante.tavoli-view', order: 0 },
					{ id: 'ristorante.nav-ordini', label: 'Ordini', view: 'ristorante.ordini-view', order: 1 },
				],
			};
			assert.strictEqual(contribution.children?.length, 2);
			assert.strictEqual(contribution.children?.[0].id, 'ristorante.nav-tavoli');
		});

		test('accepts minimal sidebar node', () => {
			const contribution: ILiquidSidebarContribution = {
				id: 'ristorante.separator',
				label: 'Separator',
			};
			assert.strictEqual(contribution.view, undefined);
			assert.strictEqual(contribution.children, undefined);
		});
	});

	// ==================== Resolved Types ====================

	suite('ILiquidEntity', () => {
		test('holds resolved schema object and extensionId', () => {
			const entity: ILiquidEntity = {
				id: 'ristorante.tavolo',
				label: 'Tavolo',
				schema: { type: 'object', properties: { posti: { type: 'number' }, stato: { type: 'string' } } },
				icon: 'table',
				extensionId: 'phonon.ristorante',
			};
			assert.strictEqual(entity.extensionId, 'phonon.ristorante');
			assert.strictEqual(typeof entity.schema, 'object');
		});
	});

	suite('ILiquidView', () => {
		test('holds resolved componentUri and extensionId', () => {
			const view: ILiquidView = {
				id: 'ristorante.tavoli-view',
				label: 'Tavoli',
				componentUri: URI.parse('file:///extensions/ristorante/views/tavoli.js'),
				mode: 'structured',
				entity: 'ristorante.tavolo',
				extensionId: 'phonon.ristorante',
			};
			assert.strictEqual(view.componentUri.scheme, 'file');
			assert.strictEqual(view.extensionId, 'phonon.ristorante');
		});
	});

	suite('ILiquidMolecule', () => {
		test('holds resolved entryUri and extensionId', () => {
			const molecule: ILiquidMolecule = {
				id: 'ristorante.costi-molecule',
				label: 'Costi',
				description: 'Analisi costi piatti',
				entryUri: URI.parse('file:///extensions/ristorante/molecules/costi.html'),
				entity: 'ristorante.ordine',
				domain: 'analytics',
				category: 'stat',
				tags: ['analytics', 'cost'],
				layout: { minCols: 4, maxCols: 12, minHeight: 150 },
				extensionId: 'phonon.ristorante',
				shows: ['ristorante.ordine'],
				relatesTo: [],
			};
			assert.strictEqual(molecule.entryUri.scheme, 'file');
			assert.strictEqual(molecule.extensionId, 'phonon.ristorante');
			assert.strictEqual(molecule.tags.length, 2);
			assert.strictEqual(molecule.domain, 'analytics');
			assert.strictEqual(molecule.category, 'stat');
		});

		test('accepts molecule with full layout and relatesTo', () => {
			const molecule: ILiquidMolecule = {
				id: 'ristorante.revenue-molecule',
				label: 'Revenue Analytics',
				description: 'Revenue analysis dashboard',
				entryUri: URI.parse('file:///extensions/ristorante/molecules/revenue.html'),
				entity: 'ristorante.ordine',
				domain: 'analytics',
				category: 'chart',
				tags: ['analytics', 'revenue'],
				layout: { minCols: 6, maxCols: 12, minHeight: 300 },
				extensionId: 'phonon.ristorante',
				shows: ['ristorante.ordine', 'ristorante.piatto'],
				relatesTo: ['ristorante.costi-molecule'],
			};
			assert.strictEqual(molecule.category, 'chart');
			assert.strictEqual(molecule.shows.length, 2);
			assert.strictEqual(molecule.relatesTo.length, 1);
			assert.strictEqual(molecule.relatesTo[0], 'ristorante.costi-molecule');
		});
	});

	suite('ILiquidDataProvider', () => {
		test('holds readonly entities array and extensionId', () => {
			const provider: ILiquidDataProvider = {
				id: 'ristorante.supabase-provider',
				entities: ['ristorante.tavolo', 'ristorante.ordine'],
				extensionId: 'phonon.ristorante',
				priority: 0,
			};
			assert.strictEqual(provider.entities.length, 2);
			assert.strictEqual(provider.extensionId, 'phonon.ristorante');
		});

		test('accepts provider with explicit priority', () => {
			const provider: ILiquidDataProvider = {
				id: 'ristorante.premium-provider',
				entities: ['ristorante.tavolo'],
				extensionId: 'phonon.ristorante',
				priority: 10,
			};
			assert.strictEqual(provider.priority, 10);
		});
	});

	suite('ILiquidSidebarNode', () => {
		test('holds resolved tree with defaulted order and extensionId', () => {
			const node: ILiquidSidebarNode = {
				id: 'ristorante.nav-root',
				label: 'Ristorante',
				icon: 'restaurant',
				order: 0,
				children: [
					{
						id: 'ristorante.nav-tavoli',
						label: 'Tavoli',
						view: 'ristorante.tavoli-view',
						order: 0,
						children: [],
						extensionId: 'phonon.ristorante',
					},
				],
				extensionId: 'phonon.ristorante',
			};
			assert.strictEqual(node.children.length, 1);
			assert.strictEqual(node.children[0].extensionId, 'phonon.ristorante');
		});
	});

	// ==================== Canvas Composition Types ====================

	suite('ComponentCategory', () => {
		test('accepts all six category variants', () => {
			const categories: ComponentCategory[] = ['stat', 'table', 'detail', 'chart', 'form', 'list'];
			assert.strictEqual(categories.length, 6);
		});
	});

	suite('CompositionLayout', () => {
		test('accepts all layout variants', () => {
			const layouts: CompositionLayout[] = ['single', 'split-horizontal', 'split-vertical', 'grid', 'stack'];
			assert.strictEqual(layouts.length, 5);
		});
	});

	suite('ICompositionSlot', () => {
		test('accepts view slot with all fields', () => {
			const slot: ICompositionSlot = {
				viewId: 'ristorante.tavoli-view',
				params: { filtro: 'liberi' },
				weight: 2,
				label: 'Tavoli Liberi',
			};
			assert.strictEqual(slot.viewId, 'ristorante.tavoli-view');
			assert.strictEqual(slot.moleculeId, undefined);
			assert.strictEqual(slot.weight, 2);
		});

		test('accepts molecule slot', () => {
			const slot: ICompositionSlot = {
				moleculeId: 'ristorante.costi-molecule',
				weight: 1,
				label: 'Costi',
			};
			assert.strictEqual(slot.viewId, undefined);
			assert.strictEqual(slot.moleculeId, 'ristorante.costi-molecule');
		});

		test('accepts minimal view slot', () => {
			const slot: ICompositionSlot = {
				viewId: 'ristorante.dashboard',
			};
			assert.strictEqual(slot.params, undefined);
			assert.strictEqual(slot.weight, undefined);
		});
	});

	suite('ICompositionIntent', () => {
		test('accepts full composition intent', () => {
			const intent: ICompositionIntent = {
				layout: 'split-horizontal',
				slots: [
					{ viewId: 'ristorante.tavoli-view', weight: 1 },
					{ viewId: 'ristorante.ordini-view', weight: 1 },
				],
				title: 'Operativo',
				transient: false,
			};
			assert.strictEqual(intent.layout, 'split-horizontal');
			assert.strictEqual(intent.slots.length, 2);
		});

		test('accepts transient intent without title', () => {
			const intent: ICompositionIntent = {
				layout: 'single',
				slots: [{ viewId: 'ristorante.dashboard' }],
				transient: true,
			};
			assert.strictEqual(intent.title, undefined);
			assert.strictEqual(intent.transient, true);
		});
	});

	// ==================== Capability Summary ====================

	suite('ILiquidCapabilitySummary', () => {
		test('accepts full capability summary', () => {
			const summary: ILiquidCapabilitySummary = {
				modules: [
					{ name: 'ristorante', description: 'Gestione ristorante completa' },
				],
				entities: [
					{ id: 'ristorante.tavolo', label: 'Tavolo', fields: ['posti', 'stato'] },
					{ id: 'ristorante.ordine', label: 'Ordine', fields: ['items', 'totale', 'stato'] },
				],
				views: [
					{ id: 'ristorante.tavoli-view', label: 'Tavoli', mode: 'structured', entity: 'ristorante.tavolo' },
					{ id: 'ristorante.dashboard', label: 'Dashboard', mode: 'canvas' },
				],
				molecules: [
					{ id: 'ristorante.costi-molecule', label: 'Costi', description: 'Cost analysis', entity: 'ristorante.ordine', domain: 'analytics', category: 'stat', tags: ['analytics', 'cost'], shows: ['ristorante.ordine'] },
				],
			};
			assert.strictEqual(summary.modules.length, 1);
			assert.strictEqual(summary.entities.length, 2);
			assert.strictEqual(summary.views.length, 2);
			assert.strictEqual(summary.views[1].entity, undefined);
			assert.strictEqual(summary.molecules.length, 1);
			assert.strictEqual(summary.molecules[0].tags.length, 2);
			assert.strictEqual(summary.molecules[0].domain, 'analytics');
			assert.strictEqual(summary.molecules[0].category, 'stat');
		});

		test('accepts empty capability summary', () => {
			const summary: ILiquidCapabilitySummary = {
				modules: [],
				entities: [],
				views: [],
				molecules: [],
			};
			assert.strictEqual(summary.modules.length, 0);
			assert.strictEqual(summary.molecules.length, 0);
		});
	});
});
