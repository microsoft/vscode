/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join, posix } from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { getActiveTypeScriptVersion } from '../../tsServer/versionManager';
import { ITypeScriptVersionProvider, TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { exists, looksLikeAbsoluteWindowsPath, looksLikeUriNotPath } from '../../utils/fs';
import { TsConfigLinkKind } from './links';

export type TsConfigLinkResolver = (documentUri: vscode.Uri, value: string) => Promise<vscode.Uri | undefined>;

/**
 * What following a link does when its target resolves but nothing lives there.
 *
 * Opening a missing file is how VS Code offers to create it, which is the right
 * affordance for the kinds that name a file and wrong for the kinds that name a
 * directory: a missing `"rootDir": "./src"` should not offer to create a file
 * named `src`.
 */
export const enum TsConfigMissingTargetPolicy {
	OfferToCreate = 'offerToCreate',
	ReportMissing = 'reportMissing',
	ReportUnbuilt = 'reportUnbuilt',
}

/** Everything that differs between link kinds once a link is followed. */
export interface TsConfigLinkKindDescriptor {
	readonly resolve: TsConfigLinkResolver;
	/** Shown when {@link resolve} yields nothing, which only module and install lookups can do. */
	readonly unresolvedMessage: (value: string) => string;
	readonly missingTarget: TsConfigMissingTargetPolicy;
}

/**
 * One descriptor per kind. A total record rather than a map, so that adding a
 * kind without stating how it resolves and what it says on failure is a compile
 * error rather than a link that silently inherits another kind's behavior.
 */
export type TsConfigLinkDescriptors = Readonly<Record<TsConfigLinkKind, TsConfigLinkKindDescriptor>>;

/**
 * Whether TypeScript would treat a value as a relative path rather than a
 * module or package name. Mirrors the compiler's `pathIsRelative`: `.`, `..`,
 * and anything under them, with either separator.
 */
export function looksLikeRelativePath(value: string): boolean {
	return /^\.\.?(?:$|[\\/])/.test(value);
}

/**
 * Whether a value is rooted on any platform, so the result does not depend on
 * the platform the extension host runs on. Mirrors the compiler's
 * `isRootedDiskPath`, minus URIs, which the selectors have already excluded.
 */
export function looksLikeAbsolutePath(value: string): boolean {
	return value.startsWith('/') || value.startsWith('\\') || looksLikeAbsoluteWindowsPath(value);
}

async function resolveNodeModulesPath(baseDirUri: vscode.Uri, pathCandidates: string[]): Promise<vscode.Uri | undefined> {
	let currentUri = baseDirUri;
	const baseCandidate = pathCandidates[0];
	const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
	const moduleBasePath = baseCandidate.split(posix.sep).slice(0, sepIndex).join(posix.sep);
	while (true) {
		const moduleAbsoluteUrl = vscode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
		let moduleStat: vscode.FileStat | undefined;
		try {
			moduleStat = await vscode.workspace.fs.stat(moduleAbsoluteUrl);
		} catch (err) {
			// noop
		}

		if (moduleStat && (moduleStat.type & vscode.FileType.Directory)) {
			for (const uriCandidate of pathCandidates
				.map((relativePath) => relativePath.split(posix.sep).slice(sepIndex).join(posix.sep))
				// skip empty paths within module
				.filter(Boolean)
				.map((relativeModulePath) => vscode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))
			) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
				}
			}
			// Continue to looking for potentially another version
		}

		const oldUri = currentUri;
		currentUri = vscode.Uri.joinPath(currentUri, '..');

		// Can't go next. Reached the system root
		if (oldUri.path === currentUri.path) {
			return;
		}
	}
}

// Reference Extends:https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
// Reference Project References: https://github.com/microsoft/TypeScript/blob/7377f5cb9db19d79a6167065b323a45611c812b5/src/compiler/tsbuild.ts#L188C1-L194C2
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri: vscode.Uri, pathValue: string, missingSuffix: string): Promise<vscode.Uri | undefined> {
	async function resolve(absolutePath: vscode.Uri): Promise<vscode.Uri> {
		if (absolutePath.path.endsWith('.json') || await exists(absolutePath)) {
			return absolutePath;
		}
		return absolutePath.with({ path: `${absolutePath.path}${missingSuffix}` });
	}

	if (looksLikeRelativePath(pathValue)) {
		return resolve(vscode.Uri.joinPath(baseDirUri, pathValue));
	}

	if (looksLikeAbsolutePath(pathValue)) {
		return resolve(vscode.Uri.file(pathValue));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		pathValue,
		...pathValue.endsWith('.json') ? [] : [
			`${pathValue}.json`,
			`${pathValue}/tsconfig.json`,
		]
	]);
}

async function resolveRelativePath(documentUri: vscode.Uri, value: string): Promise<vscode.Uri> {
	return looksLikeAbsolutePath(value)
		? vscode.Uri.file(value)
		: vscode.Uri.joinPath(Utils.dirname(documentUri), value);
}

/**
 * The lib files sit beside the server entry point. On desktop that is a file
 * system path, in the browser it is a URI string, so the two cases are built
 * differently.
 */
export function libFileUri(versionPath: string, fileName: string): vscode.Uri {
	if (looksLikeUriNotPath(versionPath)) {
		return vscode.Uri.joinPath(vscode.Uri.parse(versionPath), '..', fileName);
	}

	return vscode.Uri.file(join(dirname(versionPath), fileName));
}

/**
 * Known limitation: since TypeScript 5.0 a project can override a lib file by
 * installing `node_modules/@typescript/lib-dom` and the compiler prefers that
 * copy. This always opens the copy shipped with the TypeScript install.
 */
async function resolveLibPath(
	versionProvider: ITypeScriptVersionProvider,
	workspaceState: vscode.Memento,
	value: string,
): Promise<vscode.Uri | undefined> {
	const fileName = `lib.${value.toLowerCase()}.d.ts`;

	// The version the service is actually using first, then any other local
	// install, then the TypeScript bundled with VS Code.
	//
	// Every provider getter rescans disk, and `bundledVersion` shows an error
	// toast before throwing, so each is read once and the reads are deduplicated
	// by path rather than repeated.
	const versions: TypeScriptVersion[] = [];

	// Without a global tsdk the active version is the bundled one, and the only
	// way resolving it can throw is that bundled install being missing. Either
	// way the bundled getter has already been read, toast included.
	let bundledVersionRead: boolean;

	try {
		const activeVersion = getActiveTypeScriptVersion(versionProvider, workspaceState);
		versions.push(activeVersion);
		bundledVersionRead = activeVersion.source === TypeScriptVersionSource.Bundled;
	} catch {
		bundledVersionRead = true;
	}

	versions.push(...versionProvider.localVersions);

	if (!bundledVersionRead) {
		try {
			versions.push(versionProvider.bundledVersion);
		} catch {
			// No bundled version available
		}
	}

	const seen = new Set<string>();

	for (const version of versions) {
		if (seen.has(version.path)) {
			continue;
		}

		seen.add(version.path);

		const candidate = libFileUri(version.path, fileName);

		if (await exists(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

/** `@scope/name` is published as `@types/scope__name`. */
export function typesPackageName(value: string): string {
	return value.startsWith('@')
		? `@types/${value.slice(1).replace('/', '__')}`
		: `@types/${value}`;
}

/**
 * Known limitation: TypeScript resolves a `types` entry against
 * `compilerOptions.typeRoots` when that option is set, and this resolver cannot,
 * because a resolver is handed only the document URI and the value, never the
 * parsed document. Package names are therefore always looked up in
 * `node_modules`, which is the default `typeRoots` and the common case.
 */
async function resolveTypePackage(documentUri: vscode.Uri, value: string): Promise<vscode.Uri | undefined> {
	// TypeScript also accepts a path here, such as `"./typings/foo"`.
	if (looksLikeRelativePath(value) || looksLikeAbsolutePath(value)) {
		return resolveRelativePath(documentUri, value);
	}

	const typesName = typesPackageName(value);
	const baseDirUri = Utils.dirname(documentUri);

	return await resolveNodeModulesPath(baseDirUri, [`${typesName}/index.d.ts`, `${typesName}/package.json`])
		?? await resolveNodeModulesPath(baseDirUri, [`${value}/index.d.ts`, `${value}/package.json`]);
}

export function createLinkDescriptors(
	versionProvider: ITypeScriptVersionProvider,
	workspaceState: vscode.Memento,
): TsConfigLinkDescriptors {
	const unresolvedModule = (value: string) => vscode.l10n.t("Failed to resolve {0} as module", value);
	// `resolveRelativePath` always yields a URI, so this wording is never shown; the
	// record is total so that the kind states it rather than inheriting another's.
	const unresolvedPath = (value: string) => vscode.l10n.t("Failed to resolve {0}", value);

	return {
		[TsConfigLinkKind.Extends]: {
			resolve: (documentUri, value) => getTsconfigPath(Utils.dirname(documentUri), value, '.json'),
			unresolvedMessage: unresolvedModule,
			missingTarget: TsConfigMissingTargetPolicy.OfferToCreate,
		},
		[TsConfigLinkKind.Reference]: {
			resolve: (documentUri, value) => getTsconfigPath(Utils.dirname(documentUri), value, '/tsconfig.json'),
			unresolvedMessage: unresolvedModule,
			missingTarget: TsConfigMissingTargetPolicy.OfferToCreate,
		},
		[TsConfigLinkKind.ProjectFile]: {
			resolve: resolveRelativePath,
			unresolvedMessage: unresolvedPath,
			missingTarget: TsConfigMissingTargetPolicy.OfferToCreate,
		},
		[TsConfigLinkKind.Path]: {
			resolve: resolveRelativePath,
			unresolvedMessage: unresolvedPath,
			missingTarget: TsConfigMissingTargetPolicy.ReportMissing,
		},
		[TsConfigLinkKind.BuildOutput]: {
			resolve: resolveRelativePath,
			unresolvedMessage: unresolvedPath,
			missingTarget: TsConfigMissingTargetPolicy.ReportUnbuilt,
		},
		[TsConfigLinkKind.Lib]: {
			resolve: (_documentUri, value) => resolveLibPath(versionProvider, workspaceState, value),
			unresolvedMessage: value => vscode.l10n.t("Failed to resolve TypeScript lib {0}", value),
			missingTarget: TsConfigMissingTargetPolicy.ReportMissing,
		},
		[TsConfigLinkKind.TypePackage]: {
			resolve: resolveTypePackage,
			unresolvedMessage: value => vscode.l10n.t("Failed to resolve types package {0}", value),
			missingTarget: TsConfigMissingTargetPolicy.ReportMissing,
		},
	};
}
