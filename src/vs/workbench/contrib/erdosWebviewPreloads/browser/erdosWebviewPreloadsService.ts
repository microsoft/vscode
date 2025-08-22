/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IErdosWebviewPreloadsService } from '../../../services/erdosWebviewPreloads/common/erdosWebviewPreloadsService.js';

/**
 * ErdosWebviewPreloadsService implementation
 */
export class ErdosWebviewPreloadsService extends Disposable implements IErdosWebviewPreloadsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('ErdosWebviewPreloadsService initialized');
	}

	/**
	 * Get preload scripts for webviews
	 */
	getPreloadScripts(): string[] {
		this.logService.debug('Getting webview preload scripts');
		// TODO: Return actual preload script paths
		return [];
	}

	/**
	 * Register a new preload script
	 */
	registerPreloadScript(scriptPath: string): void {
		this.logService.debug('Registering preload script:', scriptPath);
		// TODO: Implement preload script registration
	}

	/**
	 * Unregister a preload script
	 */
	unregisterPreloadScript(scriptPath: string): void {
		this.logService.debug('Unregistering preload script:', scriptPath);
		// TODO: Implement preload script unregistration
	}
}
