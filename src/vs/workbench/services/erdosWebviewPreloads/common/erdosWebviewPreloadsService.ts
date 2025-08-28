/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosWebviewPreloadsService = createDecorator<IErdosWebviewPreloadsService>('erdosWebviewPreloadsService');

export interface IErdosWebviewPreloadsService {
	readonly _serviceBrand: undefined;

	/**
	 * Get preload scripts for webviews
	 */
	getPreloadScripts(): string[];

	/**
	 * Register a new preload script
	 */
	registerPreloadScript(scriptPath: string): void;

	/**
	 * Unregister a preload script
	 */
	unregisterPreloadScript(scriptPath: string): void;
}


