/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Type declarations for @vscode/macos-keychain.
// The package is an optional dependency (macOS-only native addon), so types
// are duplicated here to ensure TypeScript compilation succeeds on all platforms.

declare module '@vscode/macos-keychain' {
	export function keychainSet(service: string, account: string, value: string): void;
	export function keychainGet(service: string, account: string): string | undefined;
	export function keychainDelete(service: string, account: string): boolean;
	export function keychainList(service: string): string[];
}
