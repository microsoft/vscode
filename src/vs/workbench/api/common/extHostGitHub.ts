/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type * as internalGitHub from '@vscode/internal-github';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError, illegalArgument } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { GitHubErrorCodeDto, GitHubResultDto, IGitHubGistDto, MainThreadGitHubShape } from './extHost.protocol.js';

export class GitHubError extends Error {

	readonly code: GitHubErrorCodeDto;
	readonly status: number | undefined;

	constructor(message: string, code: GitHubErrorCodeDto, status?: number) {
		super(message);
		this.name = 'GitHubError';
		this.code = code;
		this.status = status;
	}
}

/** Owns extension-host client handles; the main thread owns the corresponding GitHub service leases. */
export class ExtHostGitHub {

	private _nextHandle = 0;

	constructor(private readonly _proxy: MainThreadGitHubShape) { }

	async getClient(extension: IExtensionDescription, sessionId: string, token: vscode.CancellationToken | undefined): Promise<internalGitHub.GitHubClient> {
		if (typeof sessionId !== 'string' || !sessionId) {
			throw illegalArgument('sessionId');
		}
		const client = await this._acquire(token, (handle, token) => this._proxy.$getClient(handle, extension.identifier.value, sessionId, token));
		const gists: internalGitHub.GitHubGists = Object.freeze({
			get: (gistId: string, token?: vscode.CancellationToken) => client.run(token, (handle, token) => this._proxy.$getGist(handle, gistId, token)).then(toGist),
			create: (gist: internalGitHub.GitHubGistCreateOptions, token?: vscode.CancellationToken) => client.run(token, (handle, token) => this._proxy.$createGist(handle, {
				public: gist?.public,
				files: gist?.files,
			}, token)).then(toGist),
		});
		return Object.freeze({ gists, dispose: () => client.dispose() });
	}

	async getAnonymousClient(extension: IExtensionDescription, token: vscode.CancellationToken | undefined): Promise<internalGitHub.GitHubAnonymousClient> {
		const client = await this._acquire(token, (handle, token) => this._proxy.$getAnonymousClient(handle, extension.identifier.value, token));
		const gists: internalGitHub.GitHubGistReader = Object.freeze({
			get: (gistId: string, token?: vscode.CancellationToken) => client.run(token, (handle, token) => this._proxy.$getGist(handle, gistId, token)).then(toGist),
		});
		return Object.freeze({ gists, dispose: () => client.dispose() });
	}

	private async _acquire(token: vscode.CancellationToken | undefined, acquire: (handle: number, token: CancellationToken) => Promise<GitHubResultDto<void>>): Promise<ExtHostGitHubClient> {
		if (token?.isCancellationRequested) {
			throw new CancellationError();
		}
		const handle = this._nextHandle++;
		let result: GitHubResultDto<void>;
		try {
			result = await acquire(handle, token ?? CancellationToken.None);
		} catch (error) {
			this._proxy.$releaseClient(handle);
			throw toError(error);
		}
		if (result.kind !== 'ok' || token?.isCancellationRequested) {
			// A cancellation can race a successful reply; the release is idempotent on the main thread.
			this._proxy.$releaseClient(handle);
			throw result.kind === 'error' ? toGitHubError(result.error) : new CancellationError();
		}
		return new ExtHostGitHubClient(this._proxy, handle);
	}
}

class ExtHostGitHubClient {

	private _disposed = false;
	private readonly _pending = new Set<CancellationTokenSource>();

	constructor(
		private readonly _proxy: MainThreadGitHubShape,
		private readonly _handle: number,
	) { }

	async run<T>(token: vscode.CancellationToken | undefined, operation: (handle: number, token: CancellationToken) => Promise<GitHubResultDto<T>>): Promise<T> {
		if (this._disposed) {
			throw disposedError();
		}
		if (token?.isCancellationRequested) {
			throw new CancellationError();
		}
		const source = new CancellationTokenSource(token);
		this._pending.add(source);
		try {
			let result: GitHubResultDto<T>;
			try {
				result = await operation(this._handle, source.token);
			} catch (error) {
				throw source.token.isCancellationRequested ? new CancellationError() : toError(error);
			}
			if (result.kind === 'ok') {
				return result.value;
			}
			if (result.kind === 'canceled' || source.token.isCancellationRequested) {
				throw new CancellationError();
			}
			throw toGitHubError(result.error);
		} finally {
			this._pending.delete(source);
			source.dispose();
		}
	}

	dispose(): void {
		if (!this._disposed) {
			this._disposed = true;
			for (const source of this._pending) {
				source.cancel();
			}
			this._proxy.$releaseClient(this._handle);
		}
	}
}

/**
 * Built-in extensions that may import {@link internalGitHubModuleName}. Eligibility is an explicit
 * allowlist of built-in extensions; the module name alone is not access control.
 */
const internalGitHubConsumers: ReadonlySet<string> = new Set([
	'vscode.configuration-editing',
]);

export const internalGitHubModuleName = '@vscode/internal-github';

/**
 * Creates the `@vscode/internal-github` module for one extension. The extension identity is bound
 * here, so the importer cannot request a client on behalf of another extension.
 */
export function createInternalGitHubModule(extension: IExtensionDescription, extHostGitHub: ExtHostGitHub): typeof internalGitHub {
	return Object.freeze({
		getClient: (sessionId: string, token?: vscode.CancellationToken) => extHostGitHub.getClient(extension, sessionId, token),
		getAnonymousClient: (token?: vscode.CancellationToken) => extHostGitHub.getAnonymousClient(extension, token),
		GitHubError,
	});
}

/**
 * Provides `@vscode/internal-github` to eligible built-in extensions through the extension host's
 * `require` interception (CommonJS, in the node and web worker hosts). Native ESM importers are not
 * supported and fail to resolve the module. An importer that cannot be identified, is not built in
 * or is not on the allowlist is rejected; there is no fallback identity.
 */
export class InternalGitHubModuleFactory {

	readonly nodeModuleName = internalGitHubModuleName;

	private readonly _modules = new Map<string, typeof internalGitHub>();

	constructor(
		private readonly _extensionPaths: { findSubstr(uri: URI): IExtensionDescription | undefined },
		private readonly _extHostGitHub: ExtHostGitHub,
	) { }

	load(_request: string, parent: URI): typeof internalGitHub {
		const extension = this._extensionPaths.findSubstr(parent);
		if (!extension || !extension.isBuiltin || !internalGitHubConsumers.has(extension.identifier.value)) {
			throw new Error(`Cannot find module '${internalGitHubModuleName}'`);
		}
		let module = this._modules.get(extension.identifier.value);
		if (!module) {
			module = createInternalGitHubModule(extension, this._extHostGitHub);
			this._modules.set(extension.identifier.value, module);
		}
		return module;
	}
}

function toGist(dto: IGitHubGistDto): internalGitHub.GitHubGist {
	return Object.freeze({
		id: dto.id,
		htmlUrl: URI.parse(dto.htmlUrl),
		files: Object.freeze(dto.files.map(file => Object.freeze({
			content: file.content,
			isBinary: file.isBinary,
			truncated: file.truncated,
		}))),
	});
}

function toGitHubError(error: { readonly code: GitHubErrorCodeDto; readonly message: string; readonly status?: number }): GitHubError {
	return new GitHubError(error.message, error.code, error.status);
}

function disposedError(): GitHubError {
	return new GitHubError('The GitHub client has been disposed.', 'disposed');
}

/** Maps RPC failures, including a terminated main-thread connection, to the public error contract. */
function toError(error: unknown): Error {
	if (error && typeof error === 'object' && (error as { name?: unknown }).name === 'Canceled') {
		return new CancellationError();
	}
	return error instanceof Error ? error : new GitHubError('The GitHub request failed.', 'unknown');
}
