/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Status of a diagnostic check.
 */
export type DiagnosticStatus = 'pass' | 'fail' | 'unknown' | 'info';

/**
 * Unique identifier for a diagnostic check.
 */
export type DiagnosticCheckId = 'pathLength' | 'symlinkSupport' | 'wslDetection';

/**
 * Result of a diagnostic check.
 */
export interface DiagnosticResult {
	/**
	 * Unique identifier for this check.
	 */
	readonly id: DiagnosticCheckId;

	/**
	 * Display name of the check.
	 */
	readonly name: string;

	/**
	 * Status of the check.
	 */
	readonly status: DiagnosticStatus;

	/**
	 * Current value or error message (e.g., "PATH length: 2500 chars").
	 */
	readonly message: string;

	/**
	 * Detailed error message if status is 'unknown' or 'fail'.
	 */
	readonly error?: string;

	/**
	 * Remediation steps for failed checks.
	 */
	readonly remediation?: string;

	/**
	 * Link to documentation section in CONTRIBUTING.md.
	 * Uses auto-generated anchor from heading (e.g., "#path-length-requirements").
	 */
	readonly documentationLink?: string;
}

