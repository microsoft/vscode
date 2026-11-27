/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { isEqualAuthority } from '../../../base/common/resources.js';
import { isAbsolute } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { parseConnectionTokenFile } from '../common/connectionToken.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';

/** A launch or connection failure that must never fall back to an unauthenticated connection. */
export class RemoteConnectionTokenError extends Error { }

/** Validate before dispatching to window, URL or command-line-only handlers. */
export function validateRemoteConnectionTokenArguments(args: NativeParsedArgs): void {
	const file = args['remote-token-file'];
	if (file === undefined) {
		return;
	}
	const authority = args.remote;
	const match = authority?.match(/^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9._-]+):(?<port>[0-9]+)$/);
	if (!file || !isAbsolute(file) || !match || Number(match.groups!.port) < 1 || Number(match.groups!.port) > 65535) {
		throw new RemoteConnectionTokenError(localize('remoteTokenArguments', "--remote-token-file requires an absolute local file path and --remote host:port (port 1-65535)."));
	}
	const incompatibleOptions: (keyof NativeParsedArgs)[] = [
		'open-url', 'add', 'remove', 'folder-uri', 'file-uri', 'extensionDevelopmentPath', 'extensionTestsPath',
		'chat', 'tunnel', 'serve-web', 'agents', 'agent', 'install-source', 'install-builtin-extension', 'file-write',
		'locate-shell-integration-path', 'status', 'install-extension', 'uninstall-extension', 'list-extensions',
		'update-extensions', 'locate-extension', 'add-mcp', 'telemetry'
	];
	if (incompatibleOptions.some(option => args[option])) {
		throw new RemoteConnectionTokenError(localize('remoteTokenIncompatibleArguments', "--remote-token-file cannot be combined with URL, folder modification, extension development, chat, agents, or command-line-only operations."));
	}
}

/** A local credential source. Only its path is retained; each resolution reads the current token. */
export class RemoteConnectionTokenFile {
	private constructor(readonly authority: string, private readonly path: string) { }

	static fromArgs(args: NativeParsedArgs): RemoteConnectionTokenFile | undefined {
		validateRemoteConnectionTokenArguments(args);
		const file = args['remote-token-file'];
		return file === undefined ? undefined : new RemoteConnectionTokenFile(args.remote!, file);
	}

	static async read(args: NativeParsedArgs): Promise<RemoteConnectionTokenFile | undefined> {
		const source = RemoteConnectionTokenFile.fromArgs(args);
		await source?.getValue(source.authority);
		return source;
	}

	validateAuthority(authority: string): void {
		if (!isEqualAuthority(authority, this.authority)) {
			throw new RemoteConnectionTokenError(localize('remoteTokenDestination', "The remote connection token file does not belong to this remote address."));
		}
	}

	isSameSource(other: RemoteConnectionTokenFile): boolean {
		return isEqualAuthority(this.authority, other.authority) && this.path === other.path;
	}

	async getValue(authority: string): Promise<string> {
		this.validateAuthority(authority);
		let token: string | undefined;
		try {
			token = parseConnectionTokenFile(await fs.readFile(this.path, 'utf8'));
		} catch {
			throw new RemoteConnectionTokenError(localize('remoteTokenRead', "Unable to read the local remote connection token file. Keep the file available for the duration of the remote session."));
		}
		if (token === undefined) {
			throw new RemoteConnectionTokenError(localize('remoteTokenInvalid', "The remote connection token file must contain a non-empty token using only 0-9, a-z, A-Z, _, or -, optionally followed by one newline."));
		}
		return token;
	}
}

/** Main-process credential sources scoped to a window and destination, never persisted. */
export class WindowRemoteConnectionTokens<T extends object> {
	readonly #windows = new WeakMap<T, { authority: string | undefined; source: RemoteConnectionTokenFile | undefined; required: boolean; failed: boolean }>();

	bind(window: T, authority: string | undefined, source?: RemoteConnectionTokenFile, required = false): boolean {
		const previous = this.#windows.get(window);
		if (source) {
			source.validateAuthority(authority ?? '');
		} else if (previous && isEqualAuthority(previous.authority, authority)) {
			source = previous.source;
			required ||= previous.required;
		}
		required ||= !!source;
		this.#windows.set(window, { authority, source, required, failed: false });
		return required;
	}

	canReuse(window: T, authority: string, source: RemoteConnectionTokenFile): boolean {
		const binding = this.#windows.get(window);
		return !!binding && !binding.failed && isEqualAuthority(binding.authority, authority) && !!binding.source?.isSameSource(source);
	}

	async get(window: T, authority: string): Promise<string | undefined> {
		const binding = this.#windows.get(window);
		if (!binding) {
			return undefined;
		}
		if (!isEqualAuthority(binding.authority, authority)) {
			throw new RemoteConnectionTokenError(localize('remoteTokenWindowAuthority', "The remote connection token file does not belong to this window or remote address."));
		}
		if (!binding.source && binding.required) {
			throw new RemoteConnectionTokenError(localize('remoteTokenRestore', "This window requires a remote connection token. Launch it again with --remote and --remote-token-file."));
		}
		try {
			const token = await binding.source?.getValue(authority);
			// A read can finish after the window has navigated or received a different source.
			if (this.#windows.get(window) !== binding) {
				throw new RemoteConnectionTokenError(localize('remoteTokenChanged', "The remote connection changed while reading its token file. Try connecting again."));
			}
			binding.failed = false;
			return token;
		} catch (error) {
			binding.failed = true;
			throw error;
		}
	}
}
