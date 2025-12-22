/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This module is a placeholder - actual bidirectional sync uses the IncrServer
// functions in typstWasm.ts: initIncrServerForSync, resolveSpanFromPath, resolvePathsFromSpan

export interface SpanResult {
	start: { span: number; offset: number };
	end: { span: number; offset: number };
}

export interface ResolvedLocation {
	filepath: string;
	line: number;
	column: number;
}

// Placeholder exports - use the functions from ./index.ts instead
export async function initBidirectionalWasm(): Promise<boolean> {
	return false;
}

export function createIncrServer(): boolean {
	return false;
}

export function resolveSpan(_path: number[]): SpanResult | null {
	return null;
}

export function resolvePaths(_spanRaw: number, _offset: number): number[][] {
	return [];
}

export function disposeBidirectional(): void { }
