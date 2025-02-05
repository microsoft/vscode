import * as semver from 'semver';
import logger, { Logger } from 'loglevel';

import {
	withTimeout,
	exponentialBackoff,
	ensureTrailingSlash,
} from "../../shared/src/utils";
import {
	executeCommand,
	fread,
	isInDevMode,
} from "../../api-bindings-wrappers/src";
import z from "zod";
import { MOST_USED_SPECS } from "./constants.js";
import { LoadLocalSpecError, SpecCDNError } from "./errors.js";

export type SpecFileImport =
	| {
		default: Fig.Spec;
		getVersionCommand?: Fig.GetVersionCommand;
	}
	| {
		default: Fig.Subcommand;
		versions: Fig.VersionDiffMap;
	};

const makeCdnUrlFactory =
	(baseUrl: string) =>
		(specName: string, ext: string = "js") =>
			`${baseUrl}${specName}.${ext}`;

const cdnUrlFactory = makeCdnUrlFactory(
	"https://specs.q.us-east-1.amazonaws.com/",
);

const stringImportCache = new Map<string, unknown>();

export const importString = async (str: string) => {
	if (stringImportCache.has(str)) {
		return stringImportCache.get(str);
	}
	const result = await import(
		/* @vite-ignore */
		URL.createObjectURL(new Blob([str], { type: "text/javascript" }))
	);

	stringImportCache.set(str, result);
	return result;
};

/*
 * Deprecated: eventually will just use importLocalSpec above
 * Load a spec import("{path}/{name}")
 */
export async function importSpecFromFile(
	name: string,
	path: string,
	localLogger: Logger = logger,
): Promise<SpecFileImport> {
	const importFromPath = async (fullPath: string) => {
		localLogger.info(`Loading spec from ${fullPath}`);
		const contents = await fread(fullPath);
		if (!contents) {
			throw new LoadLocalSpecError(`Failed to read file: ${fullPath}`);
		}
		return contents;
	};

	let result: string;
	const joinedPath = `${ensureTrailingSlash(path)}${name}`;
	try {
		result = await importFromPath(`${joinedPath}.js`);
	} catch (_) {
		result = await importFromPath(`${joinedPath}/index.js`);
	}

	return importString(result);
}

/**
 * Specs can only be loaded from non "secure" contexts, so we can't load from https
 */
//TODO@meganrogge fix
export const canLoadSpecProtocol = () => true;

// TODO: this is a problem for diff-versioned specs
export async function importFromPublicCDN<T = SpecFileImport>(
	name: string,
): Promise<T> {
	if (canLoadSpecProtocol()) {
		return withTimeout(
			20000,
			import(
				/* @vite-ignore */
				`spec://localhost/${name}.js`
			),
		);
	}

	// Total of retries in the worst case should be close to previous timeout value
	// 500ms * 2^5 + 5 * 1000ms + 5 * 100ms = 21500ms, before the timeout was 20000ms
	try {
		return await exponentialBackoff(
			{
				attemptTimeout: 1000,
				baseDelay: 500,
				maxRetries: 5,
				jitter: 100,
			},

			() => import(/* @vite-ignore */ cdnUrlFactory(name)),
		);
	} catch {
		/**/
	}

	throw new SpecCDNError("Unable to load from a CDN");
}

async function jsonFromPublicCDN(path: string): Promise<unknown> {
	if (canLoadSpecProtocol()) {
		return fetch(`spec://localhost/${path}.json`).then((res) => res.json());
	}

	return exponentialBackoff(
		{
			attemptTimeout: 1000,
			baseDelay: 500,
			maxRetries: 5,
			jitter: 100,
		},
		() => fetch(cdnUrlFactory(path, "json")).then((res) => res.json()),
	);
}

// TODO: this is a problem for diff-versioned specs
export async function importFromLocalhost<T = SpecFileImport>(
	name: string,
	port: number | string,
): Promise<T> {
	return withTimeout(
		20000,
		import(
			/* @vite-ignore */
			`http://localhost:${port}/${name}.js`
		),
	);
}

const cachedCLIVersions: Record<string, string | undefined> = {};

export const getCachedCLIVersion = (key: string) =>
	cachedCLIVersions[key] ?? null;

export async function getVersionFromFullFile(
	specData: SpecFileImport,
	name: string,
) {
	// if the default export is a function it is a versioned spec
	if (typeof specData.default === "function") {
		try {
			const storageKey = `cliVersion-${name}`;
			const version = getCachedCLIVersion(storageKey);
			if (!isInDevMode() && version !== null) {
				return version;
			}

			if ("getVersionCommand" in specData && specData.getVersionCommand) {
				const newVersion = await specData.getVersionCommand(executeCommand);
				cachedCLIVersions[storageKey] = newVersion;
				return newVersion;
			}

			const newVersion = semver.clean(
				(
					await executeCommand({
						command: name,
						args: ["--version"],
					})
				).stdout,
			);
			if (newVersion) {
				cachedCLIVersions[storageKey] = newVersion;
				return newVersion;
			}
		} catch {
			/**/
		}
	}
	return undefined;
}

// TODO: cache this request using SWR strategy
let publicSpecsRequest:
	| Promise<{
		completions: Set<string>;
		diffVersionedSpecs: Set<string>;
	}>
	| undefined;

export function clearSpecIndex() {
	publicSpecsRequest = undefined;
}

const INDEX_ZOD = z.object({
	completions: z.array(z.string()),
	diffVersionedCompletions: z.array(z.string()),
});

const createPublicSpecsRequest = async () => {
	if (publicSpecsRequest === undefined) {
		publicSpecsRequest = jsonFromPublicCDN("index")
			.then(INDEX_ZOD.parse)
			.then((index) => ({
				completions: new Set(index.completions),
				diffVersionedSpecs: new Set(index.diffVersionedCompletions),
			}))
			.catch(() => {
				publicSpecsRequest = undefined;
				return { completions: new Set(), diffVersionedSpecs: new Set() };
			});
	}
	return publicSpecsRequest;
};

export async function publicSpecExists(name: string): Promise<boolean> {
	const { completions } = await createPublicSpecsRequest();
	return completions.has(name);
}

export async function isDiffVersionedSpec(name: string): Promise<boolean> {
	const { diffVersionedSpecs } = await createPublicSpecsRequest();
	return diffVersionedSpecs.has(name);
}

export async function preloadSpecs(): Promise<SpecFileImport[]> {
	return Promise.all(
		MOST_USED_SPECS.map(async (name) => {
			// TODO: refactor everything to allow the correct diff-versioned specs to be loaded
			// too, now we are only loading the index
			if (await isDiffVersionedSpec(name)) {
				return importFromPublicCDN(`${name}/index`);
			}
			return importFromPublicCDN(name);
		}).map((promise) => promise.catch((e) => e)),
	);
}
