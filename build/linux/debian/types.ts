/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DebianArchString = 'amd64' | 'armhf' | 'arm64';

export function isDebianArchString(s: string): s is DebianArchString {
	return ['amd64', 'armhf', 'arm64'].includes(s);
}
