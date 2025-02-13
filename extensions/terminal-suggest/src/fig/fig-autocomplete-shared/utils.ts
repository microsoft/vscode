/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function makeArray<T>(object: T | T[]): T[] {
	return Array.isArray(object) ? object : [object];
}

export enum SpecLocationSource {
	GLOBAL = 'global',
	LOCAL = 'local',
}
