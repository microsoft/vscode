/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type {
	ILiquidEntity,
	ILiquidView,
	ILiquidCard,
	ILiquidDataProvider,
	ILiquidSidebarNode,
	ILiquidCapabilitySummary,
	ICompositionIntent,
} from './liquidModuleTypes.js';

export const ILiquidModuleRegistry = createDecorator<ILiquidModuleRegistry>('liquidModuleRegistry');

export interface ILiquidModuleRegistry {
	readonly _serviceBrand: undefined;

	// Read
	readonly entities: ReadonlyArray<ILiquidEntity>;
	readonly views: ReadonlyArray<ILiquidView>;
	readonly cards: ReadonlyArray<ILiquidCard>;
	readonly dataProviders: ReadonlyArray<ILiquidDataProvider>;
	readonly sidebarTree: ReadonlyArray<ILiquidSidebarNode>;

	// React
	readonly onDidChangeEntities: Event<void>;
	readonly onDidChangeViews: Event<void>;
	readonly onDidChangeCards: Event<void>;
	readonly onDidChangeDataProviders: Event<void>;
	readonly onDidChangeSidebar: Event<void>;

	// Query (for AI)
	getViewsForEntity(entityId: string): ILiquidView[];
	getCardsForEntity(entityId: string): ILiquidCard[];
	getCardsByTag(tag: string): ILiquidCard[];
	getEntitySchema(entityId: string): object | undefined;
	getCapabilities(): ILiquidCapabilitySummary;

	// Validate
	validateIntent(intent: ICompositionIntent): { valid: boolean; errors: string[] };
}
