/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join, posix } from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { getActiveTypeScriptVersion } from '../../tsServer/versionManager';
import { ITypeScriptVersionProvider, TypeScriptVersion, TypeScriptVersionSource } from '../../tsServer/versionProvider';
import { exists, looksLikeAbsolutePath, looksLikeRelativePath, looksLikeUriNotPath, normalizeSlashes } from '../../utils/fs';
import { TsLibMapReader } from './libMap';
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

	const path = normalizeSlashes(pathValue);

	if (looksLikeRelativePath(path)) {
		return resolve(vscode.Uri.joinPath(baseDirUri, path));
	}

	if (looksLikeAbsolutePath(path)) {
		return resolve(vscode.Uri.file(path));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		path,
		...path.endsWith('.json') ? [] : [
			`${path}.json`,
			`${path}/tsconfig.json`,
		]
	]);
}

async function resolveRelativePath(documentUri: vscode.Uri, value: string): Promise<vscode.Uri> {
	const path = normalizeSlashes(value);

	return looksLikeAbsolutePath(path)
		? vscode.Uri.file(path)
		: vscode.Uri.joinPath(Utils.dirname(documentUri), path);
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
 * The web build serves its lib files over http(s), where the workbench's fetch
 * provider answers every `stat` with a file and only `readFile` performs a
 * request. Downloading a multi-megabyte lib file to prove it exists, and then
 * again to show it, costs more than trusting the lib map that named it.
 */
function libFileIsServedRemotely(uri: vscode.Uri): boolean {
	return uri.scheme === 'http' || uri.scheme === 'https';
}

/**
 * A `lib` entry names a file only through the install: `es7` is `lib.es2016.d.ts`,
 * and a name that neither the install's files nor its lib map know is not a lib at
 * all, however plausible `lib.<name>.d.ts` would look.
 *
 * Most entries do name `lib.<name>.d.ts`, which a single stat settles. Only the
 * aliases need the lib map, and reading that map means loading the install's
 * compiler, so it is consulted second.
 *
 * Known limitation: since TypeScript 5.0 a project can override a lib file by
 * installing `node_modules/@typescript/lib-dom` and the compiler prefers that
 * copy. This always opens the copy shipped with the TypeScript install.
 */
async function resolveLibPath(
	versionProvider: ITypeScriptVersionProvider,
	workspaceState: vscode.Memento,
	readLibMap: TsLibMapReader,
	value: string,
): Promise<vscode.Uri | undefined> {
	const libName = value.toLowerCase();

	// Every lib file the install ships is named for the entry that loads it, so the file
	// proves the entry without the map. Only a value shaped like a lib name is looked up
	// that way: one carrying a separator would point the link out of the install.
	const namedFileName = /^[a-z0-9][a-z0-9.]*$/.test(libName) ? `lib.${libName}.d.ts` : undefined;

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
		// An install the service could not read is the one it falls back away from
		// (`TypeScriptVersionManager.reset`), so a lib is not looked up in it either.
		if (!version.isValid || seen.has(version.path)) {
			continue;
		}

		seen.add(version.path);

		// A file only proves the name where a `stat` means something, which rules out
		// the web build: its fetch provider claims every file exists.
		if (namedFileName) {
			const namedFile = libFileUri(version.path, namedFileName);

			if (!libFileIsServedRemotely(namedFile) && await exists(namedFile)) {
				return namedFile;
			}
		}

		const fileName = (await readLibMap(version))?.get(libName);

		if (!fileName) {
			continue;
		}

		const candidate = libFileUri(version.path, fileName);

		if (libFileIsServedRemotely(candidate) || await exists(candidate)) {
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
	readLibMap: TsLibMapReader,
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
			resolve: (_documentUri, value) => resolveLibPath(versionProvider, workspaceState, readLibMap, value),
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
