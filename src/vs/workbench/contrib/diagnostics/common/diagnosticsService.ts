/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import type { DiagnosticResult, DiagnosticCheckId } from './diagnosticsTypes.js';

export const IDiagnosticsService = createDecorator<IDiagnosticsService>('diagnosticsService');

/**
 * Service for running workspace environment diagnostic checks.
 */
export interface IDiagnosticsService {
	readonly _serviceBrand: undefined;

	/**
	 * Runs all diagnostic checks and returns results.
	 * Checks run sequentially for predictability.
	 */
	runDiagnostics(): Promise<DiagnosticResult[]>;

	/**
	 * Runs a specific diagnostic check by ID.
	 */
	runCheck(checkId: DiagnosticCheckId): Promise<DiagnosticResult>;

	/**
	 * Event fired when diagnostic results change.
	 */
	readonly onDidChangeResults: Event<DiagnosticResult[]>;

	/**
	 * Gets the current diagnostic results (cached).
	 */
	getResults(): DiagnosticResult[];
}
