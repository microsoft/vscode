/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosPlotsService } from '../../workbench/services/erdosPlots/common/erdosPlots.js';

/**
 * Erdos React services context.
 */
export interface ErdosReactServicesContext {
	erdosPlotsService: IErdosPlotsService;
}

/**
 * Hook to get the Erdos React services context.
 * This is a placeholder that would normally integrate with React Context.
 */
export function useErdosReactServicesContext(): ErdosReactServicesContext {
	// TODO: Implement proper React context integration
	throw new Error('React services context not implemented');
}
