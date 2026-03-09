/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILiquidDataResolver } from './liquidMoleculeBridge.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export class LiquidMockDataProvider implements ILiquidDataResolver {
	declare readonly _serviceBrand: undefined;

	private readonly _data: Record<string, unknown[]> = {
		dish: [
			{ id: 'd1', name: 'Risotto ai Funghi', price: 14.50, foodCostPercent: 28, available: true, category: 'primo' },
			{ id: 'd2', name: 'Branzino al Forno', price: 22.00, foodCostPercent: 35, available: true, category: 'secondo' },
			// allow-any-unicode-next-line
			{ id: 'd3', name: 'Tiramisù', price: 8.00, foodCostPercent: 22, available: true, category: 'dessert' },
			{ id: 'd4', name: 'Tagliata di Manzo', price: 24.00, foodCostPercent: 40, available: false, category: 'secondo' },
			{ id: 'd5', name: 'Spaghetti alle Vongole', price: 16.00, foodCostPercent: 32, available: true, category: 'primo' },
			{ id: 'd6', name: 'Insalata di Mare', price: 13.00, foodCostPercent: 30, available: true, category: 'antipasto' },
		],
		supplier: [
			{ id: 's1', name: 'Ittica Azzurra', status: 'active', lastDelivery: '2026-03-07', rating: 4.5 },
			{ id: 's2', name: 'Ortofrutta Lombarda', status: 'active', lastDelivery: '2026-03-08', rating: 4.2 },
			{ id: 's3', name: 'Caseificio Bergamo', status: 'delayed', lastDelivery: '2026-03-03', rating: 3.8 },
			{ id: 's4', name: 'Vini del Piemonte', status: 'active', lastDelivery: '2026-03-06', rating: 4.7 },
			{ id: 's5', name: 'Macelleria Rossi', status: 'expired', lastDelivery: '2026-02-20', rating: 3.2 },
		],
		order: [
			{ id: 'o1', table: 5, items: 3, total: 52.50, status: 'preparing', time: '12:30' },
			{ id: 'o2', table: 12, items: 2, total: 36.00, status: 'ready', time: '12:15' },
			{ id: 'o3', table: 3, items: 5, total: 78.00, status: 'pending', time: '12:45' },
			{ id: 'o4', table: 8, items: 1, total: 14.50, status: 'delivered', time: '12:00' },
			{ id: 'o5', table: 1, items: 4, total: 64.50, status: 'preparing', time: '12:35' },
		],
	};

	async fetch(entity: string, query?: Record<string, unknown>): Promise<unknown[]> {
		const rows = this._data[entity] ?? [];
		if (!query || Object.keys(query).length === 0) {
			return rows;
		}
		return rows.filter(row => {
			const r = row as Record<string, unknown>;
			return Object.entries(query).every(([k, v]) => r[k] === v);
		});
	}

	async mutate(_entity: string, _operation: 'create' | 'update' | 'delete', _data: unknown): Promise<void> {
		// Mock: no-op
	}
}

registerSingleton(ILiquidDataResolver, LiquidMockDataProvider, InstantiationType.Delayed);
