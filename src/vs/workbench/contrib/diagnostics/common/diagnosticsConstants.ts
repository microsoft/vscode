/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../base/common/platform.js';
import type { DiagnosticCheckId } from './diagnosticsTypes.js';

/**
 * PATH length limits by platform.
 */
export const PATH_LENGTH_LIMITS = {
	windows: 2048,
	unix: 4096
} as const;

/**
 * Get PATH length limit for current platform.
 */
export function getPathLengthLimit(): number {
	return isWindows ? PATH_LENGTH_LIMITS.windows : PATH_LENGTH_LIMITS.unix;
}

/**
 * All diagnostic check IDs.
 */
export const DIAGNOSTIC_CHECK_IDS: readonly DiagnosticCheckId[] = [
	'pathLength',
	'symlinkSupport',
	'wslDetection'
] as const;

/**
 * View container ID for diagnostics panel.
 */
export const DIAGNOSTICS_VIEW_CONTAINER_ID = 'workbench.panel.diagnostics';

/**
 * View ID for diagnostics view.
 */
export const DIAGNOSTICS_VIEW_ID = 'workbench.view.diagnostics';

/**
 * Status bar entry ID.
 */
export const DIAGNOSTICS_STATUS_BAR_ID = 'status.diagnostics';

