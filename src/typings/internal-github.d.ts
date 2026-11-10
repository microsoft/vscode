/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Internal, extension-host-provided module for a fixed set of built-in extensions. It is not part
 * of the extension API: it is neither published in `vscode.d.ts` nor available to other extensions.
 *
 * Requests are executed by the editor, which owns request scheduling, rate-limit handling, proxy
 * configuration and credentials. Access tokens are never exposed through this module.
 *
 * Built-in consumers must treat this module as external when bundling (like `vscode`) and include
 * this declaration file in their TypeScript project.
 */
declare module '@vscode/internal-github' {
	import type * as vscode from 'vscode';

	/**
	 * Get a client whose requests are authenticated with an existing GitHub.com authentication
	 * session from the `github` authentication provider.
	 *
	 * The extension chooses the session, for example with `authentication.getSession('github', ...)`.
	 * Acquisition never prompts, never signs in, and never substitutes another account: it fails with
	 * a {@link GitHubError} whose code is `authentication` when the session does not exist in the
	 * `github` provider, is no longer available, or the calling extension has not been granted access
	 * to its account. When the session is later signed out or access is revoked, requests made with
	 * the client fail with the same code.
	 *
	 * @param sessionId The id of a `github` provider session to bind.
	 * @param token A cancellation token for the acquisition only; it does not limit the client's lifetime.
	 * @returns A client that must be disposed when no longer needed.
	 */
	export function getClient(sessionId: string, token?: vscode.CancellationToken): Thenable<GitHubClient>;

	/**
	 * Get a client for public, read-only GitHub.com data. Its requests never carry credentials.
	 *
	 * @param token A cancellation token for the acquisition only; it does not limit the client's lifetime.
	 * @returns A client that must be disposed when no longer needed.
	 */
	export function getAnonymousClient(token?: vscode.CancellationToken): Thenable<GitHubAnonymousClient>;

	/**
	 * A client for public GitHub data. Disposing it cancels outstanding requests; later requests
	 * fail with a {@link GitHubError} whose code is `disposed`.
	 */
	export interface GitHubAnonymousClient extends vscode.Disposable {
		readonly gists: GitHubGistReader;
	}

	/**
	 * A client bound to one GitHub authentication session. Disposing it cancels outstanding requests;
	 * later requests fail with a {@link GitHubError} whose code is `disposed`.
	 */
	export interface GitHubClient extends vscode.Disposable {
		readonly gists: GitHubGists;
	}

	export interface GitHubGistReader {
		/**
		 * Get a gist, including the inline content of its files.
		 */
		get(gistId: string, token?: vscode.CancellationToken): Thenable<GitHubGist>;
	}

	export interface GitHubGists extends GitHubGistReader {
		/**
		 * Create a gist owned by the client's account. The session must have the `gist` scope.
		 * Creation is not retried, and a late cancellation may not prevent it.
		 */
		create(gist: GitHubGistCreateOptions, token?: vscode.CancellationToken): Thenable<GitHubGist>;
	}

	export interface GitHubGistCreateOptions {
		/**
		 * Whether the gist is public. Defaults to `false`, which creates a secret (unlisted) gist.
		 */
		readonly public?: boolean;

		/**
		 * One or more files keyed by file name. File names must not contain `/` or `\`.
		 */
		readonly files: { readonly [fileName: string]: { readonly content: string } };
	}

	export interface GitHubGist {
		readonly id: string;
		readonly htmlUrl: vscode.Uri;
		readonly files: readonly GitHubGistFile[];
	}

	export interface GitHubGistFile {
		/**
		 * The inline content: base64-encoded when `isBinary`, incomplete when `truncated`.
		 */
		readonly content: string;
		readonly isBinary: boolean;
		readonly truncated: boolean;
	}

	/**
	 * Categories of {@link GitHubError}.
	 */
	export type GitHubErrorCode = 'authentication' | 'authorization' | 'notFound' | 'validation' | 'rateLimit' | 'network' | 'timeout' | 'server' | 'invalidResponse' | 'disposed' | 'unknown';

	/**
	 * An error reported by a GitHub client. Cancellation is reported with a `CancellationError`.
	 */
	export class GitHubError extends Error {
		readonly code: GitHubErrorCode;
		readonly status: number | undefined;
		constructor(message: string, code: GitHubErrorCode, status?: number);
	}
}
