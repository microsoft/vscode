/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SEA (Single Executable Application) entrypoint shim for the `sota` CLI.
 *
 * Why this file exists:
 *   The `son-of-anton-core` promptLoader reads agent role descriptions from
 *   `.prompt.md` files on disk via `fs.readFileSync(path.join(__dirname,
 *   'prompts', filename))`. Inside a Node SEA binary there is no
 *   `node_modules/son-of-anton-core/dist/agents/prompts/` directory next to
 *   the executable — the binary is one self-contained Mach-O blob. To keep
 *   the prompt files reachable we:
 *
 *     1. Declare each `.prompt.md` file as a SEA *asset* in
 *        `sea-config.json` (the build script writes that file from the live
 *        listing of `son-of-anton-core/dist/agents/prompts/`).
 *     2. Monkey-patch `fs.readFileSync` here, *before* the bundled CLI code
 *        executes, so any call whose path ends in `prompts/<file>.prompt.md`
 *        is satisfied from the embedded SEA blob instead of the missing
 *        filesystem path.
 *
 *   The patch is a no-op when running outside SEA (e.g. during `node
 *   dist/cli.js` development), so the same file is safe to use as the
 *   esbuild entrypoint for both the SEA blob and any future non-SEA
 *   "single-file bundle" we might want to ship.
 *
 *   We deliberately avoid patching the *whole* fs surface — only the
 *   readFileSync calls whose target path lives under a `prompts/`
 *   directory. Everything else (workspace reads, history files, hook
 *   configs, the CLI's own package.json) continues to hit the real
 *   filesystem.
 */

// We use `require('fs')` rather than `import * as fs from 'fs'` so we can
// mutate the module's `readFileSync` property below. ES module imports are
// immutable bindings and esbuild rightly refuses to compile an assignment
// to one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');

interface SeaApi {
	isSea?: () => boolean;
	getAsset: (key: string) => ArrayBuffer;
}

function installSeaPromptShim(): void {
	let sea: SeaApi | undefined;
	try {
		// `node:sea` only exists inside SEA binaries. `require` throws outside SEA.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		sea = require('node:sea') as SeaApi;
	} catch {
		return;
	}
	if (!sea || typeof sea.isSea !== 'function' || !sea.isSea()) {
		return;
	}

	const originalReadFileSync = fs.readFileSync.bind(fs);
	const decoded = new Map<string, string>();
	const decoder = new TextDecoder('utf-8');

	const readPromptAsset = (filename: string, encoding: BufferEncoding | null | undefined): string | Buffer => {
		let value = decoded.get(filename);
		if (value === undefined) {
			const buf = sea!.getAsset(filename);
			value = decoder.decode(new Uint8Array(buf));
			decoded.set(filename, value);
		}
		if (encoding === undefined || encoding === null) {
			return Buffer.from(value, 'utf8');
		}
		return value;
	};

	const patched = ((target: import('fs').PathOrFileDescriptor, options?: { encoding?: BufferEncoding | null | undefined; flag?: string } | BufferEncoding | null) => {
		try {
			const asString = typeof target === 'string'
				? target
				: typeof target === 'object' && target !== null && 'toString' in target
					? String(target)
					: '';
			// Match anything that looks like `<…>/prompts/<name>.prompt.md`,
			// regardless of platform separator. The asset key we ship in
			// sea-config.json is just the bare filename.
			const match = asString.match(/[\\\/]prompts[\\\/]([^\\\/]+\.prompt\.md)$/);
			if (match) {
				const filename = match[1];
				const encoding = typeof options === 'string'
					? options
					: options && typeof options === 'object' && 'encoding' in options
						? (options.encoding ?? undefined)
						: undefined;
				return readPromptAsset(filename, encoding);
			}
		} catch {
			// Fall through to the original on any patch failure — better to
			// surface the underlying ENOENT than to mask it with a patch bug.
		}
		return originalReadFileSync(target, options as Parameters<typeof originalReadFileSync>[1]);
	}) as typeof fs.readFileSync;

	(fs as { readFileSync: typeof fs.readFileSync }).readFileSync = patched;
}

installSeaPromptShim();

// Hand off to the real CLI entrypoint. esbuild inlines this import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./cli');
