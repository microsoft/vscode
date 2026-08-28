/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Type declarations for the (plain-JS) codex protocol generator, so the TypeScript freshness
// check (check-protocol-sync.ts) can import its reusable pieces. The runnable logic lives in
// generate-protocol.mjs.

/** Absolute path to the repository root. */
export declare const REPO_ROOT: string;

/** Absolute path to the generated protocol client directory. */
export declare const OUT_DIR: string;

/** Absolute path to build/codex/codex-version.txt (the pinned codex version). */
export declare const VERSION_FILE: string;

/** Resolves the codex binary ($CODEX_BIN, vendored npm package, or PATH). */
export declare function resolveCodexBinary(): string;

/** Reads the `codex --version` of the given binary. */
export declare function readBinaryVersion(bin: string): string;

/** Reads the pinned version from build/codex/codex-version.txt. */
export declare function readPinnedVersion(): string;

/**
 * Regenerates the protocol client into `outDir` using `bin`, stamping `codexVersion` into the
 * per-file header. Wipes `outDir` first (except README.md). Output is byte-identical regardless
 * of `outDir`, so a scratch-dir regeneration can be compared against the committed client.
 */
export declare function generate(bin: string, outDir: string, codexVersion: string): void;
