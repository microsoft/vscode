/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type {
	ILiquidEntity,
	ILiquidView,
	ILiquidGraft,
	ILiquidDataProvider,
	ILiquidSidebarNode,
	ILiquidCapabilitySummary,
	ICompositionIntent,
} from './liquidGraftTypes.js';

export const ILiquidModuleRegistry = createDecorator<ILiquidModuleRegistry>('liquidModuleRegistry');

export interface ILiquidModuleRegistry {
	readonly _serviceBrand: undefined;

	// Read
	readonly entities: ReadonlyArray<ILiquidEntity>;
	readonly views: ReadonlyArray<ILiquidView>;
	readonly grafts: ReadonlyArray<ILiquidGraft>;
	readonly dataProviders: ReadonlyArray<ILiquidDataProvider>;
	readonly sidebarTree: ReadonlyArray<ILiquidSidebarNode>;

	// React
	readonly onDidChangeEntities: Event<void>;
	readonly onDidChangeViews: Event<void>;
	readonly onDidChangeGrafts: Event<void>;
	readonly onDidChangeDataProviders: Event<void>;
	readonly onDidChangeSidebar: Event<void>;

	// Query (for AI)
	getViewsForEntity(entityId: string): ILiquidView[];
	getGraftsForEntity(entityId: string): ILiquidGraft[];
	getGraftsByTag(tag: string): ILiquidGraft[];
	/** Returns grafts whose `shows` array includes the given entityId. */
	findByEntity(entityId: string): ILiquidGraft[];
	/** Returns grafts belonging to the given business domain. */
	findByDomain(domain: string): ILiquidGraft[];
	getEntitySchema(entityId: string): object | undefined;
	getCapabilities(): ILiquidCapabilitySummary;

	// Validate
	validateIntent(intent: ICompositionIntent): { valid: boolean; errors: string[] };
}
