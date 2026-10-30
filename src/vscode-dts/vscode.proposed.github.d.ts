/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Typed access to GitHub through the editor's shared GitHub service.
	 *
	 * Requests are executed by the editor, which owns request scheduling, rate-limit handling, proxy
	 * configuration and credentials. Access tokens are never exposed through this API.
	 */
	export namespace github {

		/**
		 * Get a client whose requests are authenticated with an existing GitHub.com authentication
		 * session from the `github` authentication provider.
		 *
		 * The extension is responsible for choosing the session, for example with
		 * `authentication.getSession('github', ...)`. Acquisition never prompts, never signs in, and never
		 * substitutes another account: it fails with a {@link GitHubError} whose code is
		 * `authentication` when the session does not exist in the `github` provider, is no longer
		 * available, or the calling extension has not been granted access to its account. When the
		 * session is later signed out or the extension's access is revoked, requests made with the client
		 * fail with the same code.
		 *
		 * @param sessionId The {@link AuthenticationSession.id id} of a `github` provider session to bind.
		 * @param token A cancellation token for the acquisition only; it does not limit the client's lifetime.
		 * @returns A client that must be {@link GitHubClient.dispose disposed} when no longer needed.
		 */
		export function getClient(sessionId: string, token?: CancellationToken): Thenable<GitHubClient>;

		/**
		 * Get a client for public, read-only GitHub.com data. Its requests never carry credentials,
		 * even when the user is signed in.
		 *
		 * @param token A cancellation token for the acquisition only; it does not limit the client's lifetime.
		 * @returns A client that must be {@link GitHubAnonymousClient.dispose disposed} when no longer needed.
		 */
		export function getAnonymousClient(token?: CancellationToken): Thenable<GitHubAnonymousClient>;
	}

	/**
	 * A client for public GitHub data.
	 *
	 * {@link Disposable.dispose Disposing} the client releases it: outstanding requests are cancelled
	 * and later requests fail with a {@link GitHubError} whose code is `disposed`.
	 */
	export interface GitHubAnonymousClient extends Disposable {
		/**
		 * Read access to gists.
		 */
		readonly gists: GitHubGistReader;
	}

	/**
	 * A client bound to one GitHub authentication session.
	 *
	 * {@link Disposable.dispose Disposing} the client releases it: outstanding requests are cancelled
	 * and later requests fail with a {@link GitHubError} whose code is `disposed`.
	 */
	export interface GitHubClient extends Disposable {
		/**
		 * Gist retrieval and creation.
		 */
		readonly gists: GitHubGists;
	}

	/**
	 * Gist read operations.
	 */
	export interface GitHubGistReader {
		/**
		 * Get a gist, including the inline content of its files.
		 *
		 * @param gistId The gist identifier.
		 * @param token A cancellation token.
		 */
		get(gistId: string, token?: CancellationToken): Thenable<GitHubGist>;
	}

	/**
	 * Gist read and write operations.
	 */
	export interface GitHubGists extends GitHubGistReader {
		/**
		 * Create a gist owned by the client's account. The session must have the `gist` scope.
		 *
		 * Gist creation is not retried. A cancellation that arrives after the request was sent may
		 * not prevent the gist from being created.
		 *
		 * @param gist The gist to create.
		 * @param token A cancellation token.
		 */
		create(gist: GitHubGistCreateOptions, token?: CancellationToken): Thenable<GitHubGist>;
	}

	/**
	 * The contents of a gist to create.
	 */
	export interface GitHubGistCreateOptions {
		/**
		 * Whether the gist is public. Defaults to `false`, which creates a secret gist: it is not
		 * listed publicly, but anyone with its URL can read it.
		 */
		readonly public?: boolean;

		/**
		 * One or more files keyed by file name. File names must not contain `/` or `\`.
		 */
		readonly files: { readonly [fileName: string]: { readonly content: string } };
	}

	/**
	 * A gist and the inline content of its files.
	 */
	export interface GitHubGist {
		/**
		 * The gist identifier.
		 */
		readonly id: string;

		/**
		 * The gist's page on GitHub.
		 */
		readonly htmlUrl: Uri;

		/**
		 * The gist's files, in the order returned by GitHub.
		 */
		readonly files: readonly GitHubGistFile[];
	}

	/**
	 * A gist file with its inline content.
	 */
	export interface GitHubGistFile {
		/**
		 * The inline file content. It is base64-encoded when {@link GitHubGistFile.isBinary isBinary}
		 * is `true`, and incomplete when {@link GitHubGistFile.truncated truncated} is `true`.
		 */
		readonly content: string;

		/**
		 * Whether GitHub treats the file as binary, in which case {@link GitHubGistFile.content content}
		 * is base64-encoded.
		 */
		readonly isBinary: boolean;

		/**
		 * Whether {@link GitHubGistFile.content content} contains only part of the file.
		 */
		readonly truncated: boolean;
	}

	/**
	 * Categories of {@link GitHubError GitHub errors}.
	 *
	 * - `authentication`: the session is unavailable, signed out, not accessible to the extension, or was rejected.
	 * - `authorization`: the account is not permitted to perform the operation.
	 * - `notFound`: the resource does not exist or is not visible to the client.
	 * - `validation`: the request was invalid.
	 * - `rateLimit`: the request was rejected by rate limits or local admission control.
	 * - `network`: the request could not reach GitHub.
	 * - `timeout`: the request did not complete in time.
	 * - `server`: GitHub reported a server failure.
	 * - `invalidResponse`: GitHub returned a response that could not be used.
	 * - `disposed`: the client was disposed.
	 * - `unknown`: any other failure.
	 */
	export type GitHubErrorCode = 'authentication' | 'authorization' | 'notFound' | 'validation' | 'rateLimit' | 'network' | 'timeout' | 'server' | 'invalidResponse' | 'disposed' | 'unknown';

	/**
	 * An error reported by a GitHub client. Cancellation is reported with a {@link CancellationError}.
	 */
	export class GitHubError extends Error {

		/**
		 * The error category.
		 */
		readonly code: GitHubErrorCode;

		/**
		 * The HTTP status reported by GitHub, if any.
		 */
		readonly status: number | undefined;

		/**
		 * @param message A human-readable message.
		 * @param code The error category.
		 * @param status The HTTP status, if any.
		 */
		constructor(message: string, code: GitHubErrorCode, status?: number);
	}
}
