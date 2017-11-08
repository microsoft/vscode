/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface PerformanceEntry {
	readonly type: 'mark' | 'measure';
	readonly name: string;
	readonly startTime: number;
	readonly duration: number;
}

export function mark(name: string): void;
export function measure(name: string, from?: string, to?: string): void;
export function time(name: string): { stop(): void };
export function getEntries(type?: 'mark' | 'measure'): PerformanceEntry[];
export function importEntries(entries: PerformanceEntry[]): void;
