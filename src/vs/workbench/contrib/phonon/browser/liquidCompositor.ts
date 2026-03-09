/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import type {
	ICompositionIntent,
	ICompositionSlot,
	CompositionLayout,
	ILiquidMolecule,
	ComponentCategory,
} from '../common/liquidModuleTypes.js';

export const ICompositionEngine = createDecorator<ICompositionEngine>('liquidCompositionEngine');

export interface ICompositionEngine {
	readonly _serviceBrand: undefined;

	/**
	 * Deterministic composition from a view's declared defaultMolecules.
	 * Zero AI involvement. Used by sidebar navigation.
	 */
	composeFromView(viewId: string, defaultMoleculeIds: readonly string[]): ICompositionIntent | undefined;

	/**
	 * AI-enhanced composition from entity + action.
	 * Uses pickComponent + category preference to select molecules.
	 * Ported from gestionale compositor logic.
	 */
	composeFromIntent(entities: readonly string[], action: string, depth?: number, preferredLayout?: CompositionLayout): ICompositionIntent | undefined;
}

/**
 * Category preference tables by action verb.
 * The order defines priority: first match in the candidate list wins.
 * Ported from gestionale compositor.
 */
const ACTION_CATEGORY_PREFERENCE: ReadonlyMap<string, readonly ComponentCategory[]> = new Map<string, readonly ComponentCategory[]>([
	['show', ['detail', 'table', 'list', 'chart', 'stat', 'form']],
	['compare', ['table', 'chart', 'list', 'detail', 'stat', 'form']],
	['summarize', ['stat', 'chart', 'table', 'detail', 'list', 'form']],
	['navigate', ['list', 'table', 'detail', 'chart', 'stat', 'form']],
	['filter', ['form', 'table', 'list', 'detail', 'chart', 'stat']],
]);

/** Default preference when the action verb is unknown. Mirrors 'show'. */
const DEFAULT_CATEGORY_PREFERENCE: readonly ComponentCategory[] = ['detail', 'table', 'list', 'chart', 'stat', 'form'];

/** Maximum composition depth (how many relatesTo hops to follow). */
const MAX_DEPTH = 2;

/** Maximum total slots in a composition. */
const MAX_SLOTS = 6;

export class CompositionEngine extends Disposable implements ICompositionEngine {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILiquidModuleRegistry private readonly _registry: ILiquidModuleRegistry,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	composeFromView(viewId: string, defaultMoleculeIds: readonly string[]): ICompositionIntent | undefined {
		if (defaultMoleculeIds.length === 0) {
			return undefined;
		}

		const slots: ICompositionSlot[] = [];
		for (const moleculeId of defaultMoleculeIds) {
			const molecule = this._registry.molecules.find(m => m.id === moleculeId);
			if (molecule) {
				slots.push({ moleculeId: molecule.id, label: molecule.label });
			} else {
				this._logService.warn(`[CompositionEngine] composeFromView: molecule "${moleculeId}" not found in registry, skipping`);
			}
		}

		if (slots.length === 0) {
			return undefined;
		}

		const view = this._registry.views.find(v => v.id === viewId);
		const title = view?.label ?? viewId;

		return {
			layout: this._calculateLayout(slots),
			slots,
			title,
			transient: false,
		};
	}

	composeFromIntent(entities: readonly string[], action: string, depth: number = 0, preferredLayout?: CompositionLayout): ICompositionIntent | undefined {
		const clampedDepth = Math.min(Math.max(depth, 0), MAX_DEPTH);
		const slots: ICompositionSlot[] = [];
		const seenMoleculeIds = new Set<string>();

		// Phase 1: pick best molecule for each entity
		for (const entity of entities) {
			if (slots.length >= MAX_SLOTS) {
				break;
			}
			const candidates = this._registry.findByEntity(entity);
			const picked = this._pickComponent(entity, action, candidates);
			if (picked && !seenMoleculeIds.has(picked.id)) {
				seenMoleculeIds.add(picked.id);
				slots.push({ moleculeId: picked.id, label: picked.label });
			}
		}

		// Phase 2: follow relatesTo for depth > 0
		if (clampedDepth > 0) {
			const primarySlots = [...slots];
			for (const slot of primarySlots) {
				if (slots.length >= MAX_SLOTS) {
					break;
				}
				const molecule = this._registry.molecules.find(m => m.id === slot.moleculeId);
				if (!molecule) {
					continue;
				}
				for (const relatedId of molecule.relatesTo) {
					if (slots.length >= MAX_SLOTS) {
						break;
					}
					const relatedCandidates = this._registry.findByEntity(relatedId);
					const relatedPicked = this._pickComponent(relatedId, action, relatedCandidates);
					if (relatedPicked && !seenMoleculeIds.has(relatedPicked.id)) {
						seenMoleculeIds.add(relatedPicked.id);
						slots.push({ moleculeId: relatedPicked.id, label: relatedPicked.label });
					}
				}
			}
		}

		if (slots.length === 0) {
			return undefined;
		}

		const layout = this._calculateLayout(slots, preferredLayout);

		return {
			layout,
			slots,
			title: `${action} ${entities.join(', ')}`,
			transient: true,
		};
	}

	/**
	 * Picks the best molecule for a given entity + action from a candidate set.
	 * Sorts by category preference rank, then alphabetical label as tiebreaker.
	 */
	private _pickComponent(_entity: string, action: string, candidates: readonly ILiquidMolecule[]): ILiquidMolecule | undefined {
		if (candidates.length === 0) {
			return undefined;
		}

		const preference = ACTION_CATEGORY_PREFERENCE.get(action) ?? DEFAULT_CATEGORY_PREFERENCE;

		const sorted = [...candidates].sort((a, b) => {
			const rankA = preference.indexOf(a.category);
			const rankB = preference.indexOf(b.category);
			// indexOf returns -1 for unknown categories; push them to end
			const safeRankA = rankA === -1 ? preference.length : rankA;
			const safeRankB = rankB === -1 ? preference.length : rankB;
			if (safeRankA !== safeRankB) {
				return safeRankA - safeRankB;
			}
			return a.label.localeCompare(b.label);
		});

		return sorted[0];
	}

	/**
	 * Determines layout from slot count, respecting preferredLayout if given and valid.
	 */
	private _calculateLayout(slots: readonly ICompositionSlot[], preferredLayout?: CompositionLayout): CompositionLayout {
		if (preferredLayout) {
			return preferredLayout;
		}

		const count = slots.length;
		if (count <= 1) {
			return 'single';
		}
		if (count === 2) {
			return 'split-horizontal';
		}
		if (count <= 4) {
			return 'grid';
		}
		return 'stack';
	}
}

registerSingleton(ICompositionEngine, CompositionEngine, InstantiationType.Delayed);
