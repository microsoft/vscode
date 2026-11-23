/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'mocha/lib/stats-collector.js' {
	import type { EventEmitter } from 'events';

	/**
	 * Records the statistics of a mocha runner, such as the number of passed tests, in its `stats`.
	 */
	function createStatsCollector(runner: EventEmitter): void;
	export = createStatsCollector;
}
