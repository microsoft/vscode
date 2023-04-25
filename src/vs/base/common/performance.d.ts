/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PerformanceMark {
	readonly name: string;
	readonly startTime: number;
}

/** @skipMangle */
export function mark(name: string): void;

/**
 * Returns all marks, sorted by `startTime`.
 * @skipMangle
 */
export function getMarks(): PerformanceMark[];
