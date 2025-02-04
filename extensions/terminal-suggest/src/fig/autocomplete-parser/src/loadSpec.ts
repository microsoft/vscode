/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import logger, { Logger } from 'loglevel';
import { Settings } from '@aws/amazon-q-developer-cli-api-bindings';
import { convertSubcommand, initializeDefault } from '@fig/autocomplete-shared';
import {
	withTimeout,
	SpecLocationSource,
	splitPath,
	ensureTrailingSlash,
} from '@aws/amazon-q-developer-cli-shared/utils';
import {
	Subcommand,
	SpecLocation,
} from '@aws/amazon-q-developer-cli-shared/internal';
import {
	SETTINGS,
	getSetting,
	executeCommand,
	isInDevMode,
} from '@aws/amazon-q-developer-cli-api-bindings-wrappers';
import {
	importFromPublicCDN,
	publicSpecExists,
	SpecFileImport,
	importSpecFromFile,
	isDiffVersionedSpec,
	importFromLocalhost,
} from './loadHelpers.js';
import { tryResolveSpecToSubcommand } from './tryResolveSpecToSubcommand.js';

/**
 * This searches for the first directory containing a .fig/ folder in the parent directories
 */
const searchFigFolder = async (currentDirectory: string) => {
	try {
		return ensureTrailingSlash(
			(
				await executeCommand({
					command: 'bash',
					args: [
						'-c',
						`until [[ -f .fig/autocomplete/build/_shortcuts.js ]] || [[ $PWD = $HOME ]] || [[ $PWD = "/" ]]; do cd ..; done; echo $PWD`,
					],
					cwd: currentDirectory,
				})
			).stdout,
		);
	} catch {
		return ensureTrailingSlash(currentDirectory);
	}
};

export const serializeSpecLocation = (location: SpecLocation): string => {
	if (location.type === SpecLocationSource.GLOBAL) {
		return `global://name=${location.name}`;
	}
	return `local://path=${location.path ?? ""}&name=${location.name}`;
};

export const getSpecPath = async (
	name: string,
	cwd: string,
	isScript?: boolean,
): Promise<SpecLocation> => {
	if (name === "?") {
		// If the user is searching for _shortcuts.js by using "?"
		const path = await searchFigFolder(cwd);
		return { name: "_shortcuts", type: SpecLocationSource.LOCAL, path };
	}

	const personalShortcutsToken =
		getSetting(SETTINGS.PERSONAL_SHORTCUTS_TOKEN) || "+";
	if (name === personalShortcutsToken) {
		return { name: "+", type: SpecLocationSource.LOCAL, path: "~/" };
	}

	const [path, basename] = splitPath(name);

	if (!isScript) {
		const type = SpecLocationSource.GLOBAL;

		// If `isScript` is undefined, we are parsing the first token, and
		// any path with a / is a script.
		if (isScript === undefined) {
			// special-case: Symfony has "bin/console" which can be invoked directly
			// and should not require a user to create script completions for it
			if (name === "bin/console" || name.endsWith("/bin/console")) {
				return { name: "php/bin-console", type };
			}
			if (!path.includes("/")) {
				return { name, type };
			}
		} else if (["/", "./", "~/"].every((prefix) => !path.startsWith(prefix))) {
			return { name, type };
		}
	}

	const type = SpecLocationSource.LOCAL;
	if (path.startsWith("/") || path.startsWith("~/")) {
		return { name: basename, type, path };
	}

	const relative = path.startsWith("./") ? path.slice(2) : path;
	return { name: basename, type, path: `${cwd}/${relative}` };
};

type ResolvedSpecLocation =
	| { type: "public"; name: string }
	| { type: "private"; namespace: string; name: string };

export const importSpecFromLocation = async (
	specLocation: SpecLocation,
	localLogger: Logger = logger,
): Promise<{
	specFile: SpecFileImport;
	resolvedLocation?: ResolvedSpecLocation;
}> => {
	// Try loading spec from `devCompletionsFolder` first.
	const devPath = isInDevMode()
		? (getSetting(SETTINGS.DEV_COMPLETIONS_FOLDER) as string)
		: undefined;

	const devPort = isInDevMode()
		? getSetting(SETTINGS.DEV_COMPLETIONS_SERVER_PORT)
		: undefined;

	let specFile: SpecFileImport | undefined;
	let resolvedLocation: ResolvedSpecLocation | undefined;

	if (typeof devPort === "string" || typeof devPort === "number") {
		const { diffVersionedFile, name } = specLocation;
		specFile = await importFromLocalhost(
			diffVersionedFile ? `${name}/${diffVersionedFile}` : name,
			devPort,
		);
	}

	if (!specFile && devPath) {
		try {
			const { diffVersionedFile, name } = specLocation;
			const spec = await importSpecFromFile(
				diffVersionedFile ? `${name}/${diffVersionedFile}` : name,
				devPath,
				localLogger,
			);
			specFile = spec;
		} catch {
			// fallback to loading other specs in dev mode.
		}
	}

	if (!specFile && specLocation.type === SpecLocationSource.LOCAL) {
		// If we couldn't successfully load a dev spec try loading from specPath.
		const { name, path } = specLocation;
		const [dirname, basename] = splitPath(`${path || "~/"}${name}`);

		specFile = await importSpecFromFile(
			basename,
			`${dirname}.fig/autocomplete/build/`,
			localLogger,
		);
	} else if (!specFile) {
		const { name, diffVersionedFile: versionFileName } = specLocation;

		if (await publicSpecExists(name)) {
			// If we're here, importing was successful.
			try {
				const result = await importFromPublicCDN(
					versionFileName ? `${name}/${versionFileName}` : name,
				);

				specFile = result;
				resolvedLocation = { type: "public", name };
			} catch (err) {
				localLogger.error("Unable to load from CDN", err);
				throw err;
			}
		} else {
			try {
				specFile = await importSpecFromFile(
					name,
					`~/.fig/autocomplete/build/`,
					localLogger,
				);
			} catch (_err) {
				/* empty */
			}
		}
	}

	if (!specFile) {
		throw new Error("No spec found");
	}

	return { specFile, resolvedLocation };
};

export const loadFigSubcommand = async (
	specLocation: SpecLocation,
	_context?: Fig.ShellContext,
	localLogger: Logger = logger,
): Promise<Fig.Subcommand> => {
	const { name } = specLocation;
	const location = (await isDiffVersionedSpec(name))
		? { ...specLocation, diffVersionedFile: "index" }
		: specLocation;
	const { specFile } = await importSpecFromLocation(location, localLogger);
	const subcommand = await tryResolveSpecToSubcommand(specFile, specLocation);
	return subcommand;
};

export const loadSubcommandCached = async (
	specLocation: SpecLocation,
	context?: Fig.ShellContext,
	localLogger: Logger = logger,
): Promise<Subcommand> => {
	const { name } = specLocation;
	// const path =
	// 	specLocation.type === SpecLocationSource.LOCAL ? specLocation.path : "";

	// Do not load completion spec for commands that are 'disabled' by user
	const disabledSpecs =
		<string[]>getSetting(SETTINGS.DISABLE_FOR_COMMANDS) || [];
	if (disabledSpecs.includes(name)) {
		localLogger.info(`Not getting path for disabled spec ${name}`);
		throw new Error("Command requested disabled completion spec");
	}

	// const key = [source, path || "", name].join(",");
	if (getSetting(SETTINGS.DEV_MODE_NPM_INVALIDATE_CACHE)) {
		// specCache.clear();
		Settings.set(SETTINGS.DEV_MODE_NPM_INVALIDATE_CACHE, false);
		// } else if (!getSetting(SETTINGS.DEV_MODE_NPM) && specCache.has(key)) {
		// return specCache.get(key) as Subcommand;
	}

	const subcommand = await withTimeout(
		5000,
		loadFigSubcommand(specLocation, context, localLogger),
	);
	const converted = convertSubcommand(subcommand, initializeDefault);
	// specCache.set(key, converted);
	return converted;
};
