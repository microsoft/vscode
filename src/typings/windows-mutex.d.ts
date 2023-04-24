/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from the `@types/windows-mutex` package.
// The dependency is an optional dependency that is only used on Windows,
// but we need the typings to compile on all platforms.
// The types package exported from DefinitelyTyped also maps to `windows-mutex`,
// whereas we are now using `@vscode/windows-mutex`.
declare module '@vscode/windows-mutex' {
	export class Mutex {
		constructor(name: string);
		isActive(): boolean;
		release(): void;
	}

	export function isActive(name: string): boolean;
}
