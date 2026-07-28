/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISshExec } from '../sshRemoteAgentHostHelpers.js';

/** Recognized remote operating systems. */
export type RemoteOS = 'linux' | 'darwin' | 'win32';

/** Recognized remote CPU architectures. */
export type RemoteArch = 'x64' | 'arm64' | 'armhf';

/** Descriptor for a remote machine. */
export interface IRemotePlatformInfo {
	readonly os: RemoteOS;
	readonly arch: RemoteArch;
}

declare const _remotePathBrand: unique symbol;

/**
 * A remote path. Opaque because a plain string cannot distinguish a literal
 * path from a trusted shell expression: POSIX paths deliberately carry an
 * unquoted `~` for the remote shell to expand, while a Windows
 * `$env:USERPROFILE` fragment passed to `-LiteralPath` as a quoted value would
 * not expand at all. Each platform renders its own paths from validated
 * components; the type keeps callers from constructing one by concatenation.
 */
export type RemotePath = string & { readonly [_remotePathBrand]: 'remotePath' };

/**
 * Internal helper for platform implementations to brand a validated string as
 * a {@link RemotePath}. Do not call from outside the `remotePlatform` module;
 * remote paths must originate from a platform's own builders so that their
 * components are validated first.
 */
export function _asRemotePath(value: string): RemotePath {
	return value as RemotePath;
}

/**
 * A launch target. Structured rather than a command string because
 * PowerShell's `&` does not split an executable-plus-arguments string and
 * `Invoke-Expression` would reintroduce injection. `executable` is an
 * absolute remote path; `args` are logical, already-parsed arguments.
 */
export interface IRemoteLaunchSpec {
	readonly executable: RemotePath;
	readonly args: readonly LaunchArg[];
}

/**
 * A single launch argument: either a literal value the platform quotes, or a
 * {@link RemotePath} the platform emits as-is.
 *
 * The distinction is load-bearing. A remote path is a shell *expression* —
 * `~/...` on POSIX, `"$env:USERPROFILE\..."` on Windows — that only resolves
 * because the remote shell expands it. Quoting one as a literal ships the
 * unexpanded text to the CLI, which then tries to create a directory called
 * `$env:USERPROFILE\...`.
 */
export type LaunchArg = string | { readonly path: RemotePath };

/**
 * Per-OS strategy for the remote operations the SSH agent-host transport
 * performs: path construction, CLI install and discovery, and building the
 * launch command. Every method that touches the wire takes an
 * {@link ISshExec} so implementations are unit-testable without a real SSH
 * connection.
 */
export interface IRemotePlatform {
	readonly info: IRemotePlatformInfo;

	/**
	 * Name of the CLI binary as it appears inside the downloaded archive
	 * (stem only, no extension). Selects between `code`, `code-insiders`
	 * and `code-exploration` based on product quality.
	 */
	cliArchiveName(quality: string): string;

	/** Install root for the VS Code CLI on the remote machine. */
	installRoot(serverDataFolderName: string): RemotePath;

	/** Launcher data dir passed to the CLI as `--cli-data-dir`. */
	cliDataDir(serverDataFolderName: string): RemotePath;

	/**
	 * Full path to the installed CLI binary. Commit-keyed when `commit` is
	 * provided (e.g. `<root>/code-insiders-<40hex>` on POSIX,
	 * `<root>\code-insiders-<40hex>.exe` on Windows); non-keyed otherwise
	 * for dev builds without a product commit.
	 */
	cliBin(serverDataFolderName: string, quality: string, commit?: string): RemotePath;

	/**
	 * Parse a candidate path returned by the remote. Returns the branded
	 * remote path when it matches one of the recognised shapes,
	 * `undefined` otherwise — remote output arrives untrusted and only
	 * validated shapes may re-enter a command.
	 */
	parseFallbackCliPath(candidate: string, serverDataFolderName: string, quality: string): RemotePath | undefined;

	/** Check that `path` exists as an executable file. */
	isExecutableFile(exec: ISshExec, path: RemotePath): Promise<boolean>;

	/** Update the modification time of `path`. */
	touchFile(exec: ISshExec, path: RemotePath): Promise<boolean>;

	/** Verify a CLI binary runs by invoking its `--version` handler. */
	versionCheck(exec: ISshExec, cliBin: RemotePath): Promise<boolean>;

	/**
	 * Download and unpack the CLI archive from `url` into `installRoot`
	 * and publish it at `cliBin`. Concurrent invocations for the same
	 * commit-keyed destination must not corrupt each other.
	 */
	installCli(exec: ISshExec, options: { url: string; installRoot: RemotePath; cliBin: RemotePath }): Promise<void>;

	/**
	 * Remove older commit-keyed CLI binaries from the install root,
	 * keeping the `keep` most recently modified. Best-effort: a failure
	 * for one candidate must not abandon the rest.
	 */
	pruneOldClis(exec: ISshExec, serverDataFolderName: string, quality: string, keep: number): Promise<void>;

	/**
	 * List candidate CLI binaries that could be used as a fallback when
	 * a commit-pinned install fails. Only paths recognised by
	 * {@link parseFallbackCliPath} are returned.
	 */
	findFallbackClis(exec: ISshExec, serverDataFolderName: string, quality: string): Promise<readonly RemotePath[]>;

	/** Render an {@link IRemoteLaunchSpec} to the string sent over the wire. */
	buildLaunchCommand(spec: IRemoteLaunchSpec): string;

	/**
	 * Wrap a raw, user-supplied command (`remoteAgentHostCommand`) for
	 * remote execution. POSIX-only; Windows implementations throw.
	 */
	buildRawLaunchCommand(command: string): string;
}
