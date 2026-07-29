/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @deprecated The contents of this file have moved to
 * `./virtualScheduling/index.js`. This re-export is kept for backwards
 * compatibility and will be removed once all callers have migrated.
 */

export {
	createTraceRoot,
	ROOT_TRACE,
	Trace,
	TraceContext,
} from './virtualScheduling/index.js';

export type { RunAsHandlerOptions } from './virtualScheduling/index.js';
