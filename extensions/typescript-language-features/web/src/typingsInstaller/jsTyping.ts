/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// Utilities copied from ts.JsTyping internals

export const enum NameValidationResult {
	Ok,
	EmptyName,
	NameTooLong,
	NameStartsWithDot,
	NameStartsWithUnderscore,
	NameContainsNonURISafeCharacters
}

type PackageNameValidationResult = NameValidationResult | ScopedPackageNameValidationResult;

interface ScopedPackageNameValidationResult {
	readonly name: string;
	readonly isScopeName: boolean;
	readonly result: NameValidationResult;
}

enum CharacterCodes {
	_ = 0x5F,
	dot = 0x2E,
}

const maxPackageNameLength = 214;

// Validates package name using rules defined at https://docs.npmjs.com/files/package.json
// Copied from typescript/jsTypings.ts
export function validatePackageNameWorker(packageName: string, supportScopedPackage: true): ScopedPackageNameValidationResult;
export function validatePackageNameWorker(packageName: string, supportScopedPackage: false): NameValidationResult;
export function validatePackageNameWorker(packageName: string, supportScopedPackage: boolean): PackageNameValidationResult {
	if (!packageName) {
		return NameValidationResult.EmptyName;
	}
	if (packageName.length > maxPackageNameLength) {
		return NameValidationResult.NameTooLong;
	}
	if (packageName.charCodeAt(0) === CharacterCodes.dot) {
		return NameValidationResult.NameStartsWithDot;
	}
	if (packageName.charCodeAt(0) === CharacterCodes._) {
		return NameValidationResult.NameStartsWithUnderscore;
	}

	// check if name is scope package like: starts with @ and has one '/' in the middle
	// scoped packages are not currently supported
	if (supportScopedPackage) {
		const matches = /^@([^/]+)\/([^/]+)$/.exec(packageName);
		if (matches) {
			const scopeResult = validatePackageNameWorker(matches[1], /*supportScopedPackage*/ false);
			if (scopeResult !== NameValidationResult.Ok) {
				return { name: matches[1], isScopeName: true, result: scopeResult };
			}
			const packageResult = validatePackageNameWorker(matches[2], /*supportScopedPackage*/ false);
			if (packageResult !== NameValidationResult.Ok) {
				return { name: matches[2], isScopeName: false, result: packageResult };
			}
			return NameValidationResult.Ok;
		}
	}

	if (encodeURIComponent(packageName) !== packageName) {
		return NameValidationResult.NameContainsNonURISafeCharacters;
	}

	return NameValidationResult.Ok;
}

export interface TypingResolutionHost {
	directoryExists(path: string): boolean;
	fileExists(fileName: string): boolean;
	readFile(path: string, encoding?: string): string | undefined;
	readDirectory(rootDir: string, extensions: readonly string[], excludes: readonly string[] | undefined, includes: readonly string[] | undefined, depth?: number): string[];
}
