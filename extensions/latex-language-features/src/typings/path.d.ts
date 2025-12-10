/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Type definitions for path-browserify (used in browser builds)
declare module 'path' {
	export interface ParsedPath {
		root: string;
		dir: string;
		base: string;
		ext: string;
		name: string;
	}

	export function join(...paths: string[]): string;
	export function dirname(path: string): string;
	export function basename(path: string, ext?: string): string;
	export function extname(path: string): string;
	export function resolve(...paths: string[]): string;
	export function normalize(path: string): string;
	export function relative(from: string, to: string): string;
	export function parse(path: string): ParsedPath;
	export function isAbsolute(path: string): boolean;
	export const sep: string;
	export const delimiter: string;
}

