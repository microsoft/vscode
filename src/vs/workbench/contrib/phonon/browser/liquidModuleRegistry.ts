/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import type {
	ILiquidEntity,
	ILiquidView,
	ILiquidDataProvider,
	ILiquidSidebarNode,
	ILiquidCapabilitySummary,
	ICompositionIntent,
} from '../common/liquidModuleTypes.js';

export class LiquidModuleRegistry extends Disposable implements ILiquidModuleRegistry {
	declare readonly _serviceBrand: undefined;

	private _entities: ILiquidEntity[] = [];
	private _views: ILiquidView[] = [];
	private _dataProviders: ILiquidDataProvider[] = [];
	private _sidebarTree: ILiquidSidebarNode[] = [];

	private readonly _onDidChangeEntities = this._register(new Emitter<void>());
	readonly onDidChangeEntities: Event<void> = this._onDidChangeEntities.event;

	private readonly _onDidChangeViews = this._register(new Emitter<void>());
	readonly onDidChangeViews: Event<void> = this._onDidChangeViews.event;

	private readonly _onDidChangeDataProviders = this._register(new Emitter<void>());
	readonly onDidChangeDataProviders: Event<void> = this._onDidChangeDataProviders.event;

	private readonly _onDidChangeSidebar = this._register(new Emitter<void>());
	readonly onDidChangeSidebar: Event<void> = this._onDidChangeSidebar.event;

	get entities(): ReadonlyArray<ILiquidEntity> { return this._entities; }
	get views(): ReadonlyArray<ILiquidView> { return this._views; }
	get dataProviders(): ReadonlyArray<ILiquidDataProvider> { return this._dataProviders; }
	get sidebarTree(): ReadonlyArray<ILiquidSidebarNode> { return this._sidebarTree; }

	updateEntities(entities: ILiquidEntity[]): void {
		this._entities = entities;
		this._onDidChangeEntities.fire();
	}

	updateViews(views: ILiquidView[]): void {
		this._views = views;
		this._onDidChangeViews.fire();
	}

	updateDataProviders(providers: ILiquidDataProvider[]): void {
		this._dataProviders = providers;
		this._onDidChangeDataProviders.fire();
	}

	updateSidebar(nodes: ILiquidSidebarNode[]): void {
		this._sidebarTree = this._sortNodes(nodes);
		this._onDidChangeSidebar.fire();
	}

	private _sortNodes(nodes: readonly ILiquidSidebarNode[]): ILiquidSidebarNode[] {
		return [...nodes]
			.sort((a, b) => a.order - b.order)
			.map(n => n.children.length > 0
				? { ...n, children: this._sortNodes(n.children) }
				: n
			);
	}

	getViewsForEntity(entityId: string): ILiquidView[] {
		return this._views.filter(v => v.entity === entityId);
	}

	getEntitySchema(entityId: string): object | undefined {
		return this._entities.find(e => e.id === entityId)?.schema;
	}

	getCapabilities(): ILiquidCapabilitySummary {
		return {
			modules: [],
			entities: this._entities.map(e => ({
				id: e.id,
				label: e.label,
				fields: typeof e.schema === 'object' && e.schema !== null && Object.prototype.hasOwnProperty.call(e.schema, 'properties')
					? Object.keys((e.schema as { properties: Record<string, unknown> }).properties)
					: [],
			})),
			views: this._views.map(v => ({
				id: v.id,
				label: v.label,
				mode: v.mode,
				entity: v.entity,
			})),
		};
	}

	validateIntent(intent: ICompositionIntent): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		for (const slot of intent.slots) {
			const view = this._views.find(v => v.id === slot.viewId);
			if (!view) {
				errors.push(`View "${slot.viewId}" not found in registry`);
				continue;
			}
			if (view.mode === 'structured') {
				errors.push(`View "${slot.viewId}" is structured-only, cannot be used in canvas`);
			}
		}
		return { valid: errors.length === 0, errors };
	}
}
