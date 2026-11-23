/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'glob' {
	function glob(pattern: string, options: { cwd: string }, callback: (err: Error | null, matches: string[]) => void): void;
	export = glob;
}
