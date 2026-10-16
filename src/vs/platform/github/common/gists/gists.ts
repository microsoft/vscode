/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions } from '../client/request.js';

/** A gist file and its inline content. */
export interface GistFile {
	/** File name within the gist. */
	readonly filename: string;
	/** MIME type detected by GitHub. */
	readonly type: string;
	/** Detected language, or null when GitHub cannot identify one. */
	readonly language: string | null;
	/** URL for fetching the file separately when its inline content is truncated. */
	readonly raw_url: string;
	/** Full file size in bytes, before response truncation or base64 encoding. */
	readonly size: number;
	/** Whether the inline content contains only part of the file. */
	readonly truncated: boolean;
	/** Inline file content in the declared encoding; it may be truncated. */
	readonly content: string;
	/** Binary files use base64 even when the default JSON representation is requested. */
	readonly encoding: 'utf-8' | 'base64';
}

/** Public account identity attached to an owned gist. */
export interface GistOwner {
	/** Numeric GitHub account ID. */
	readonly id: number;
	/** GitHub account login. */
	readonly login: string;
	/** URL of the owner's avatar. */
	readonly avatar_url: string;
	/** URL of the owner's GitHub profile. */
	readonly html_url: string;
}

/** Gist metadata and files. */
export interface Gist {
	/** Opaque gist identifier accepted by the REST API. */
	readonly id: string;
	/** GraphQL node identifier for the gist. */
	readonly node_id: string;
	/** REST API URL for the gist. */
	readonly url: string;
	/** Browser URL for the gist. */
	readonly html_url: string;
	/** Git URL for cloning the gist. */
	readonly git_pull_url: string;
	/** Git URL for pushing changes with an authorized user credential. */
	readonly git_push_url: string;
	/** REST API URL for the gist's forks. */
	readonly forks_url: string;
	/** REST API URL for the gist's commit history. */
	readonly commits_url: string;
	/** REST API URL for the gist's comments. */
	readonly comments_url: string;
	/** False denotes a secret, unlisted gist that remains accessible to anyone who knows its URL. */
	readonly public: boolean;
	/** Author-provided description, or null when absent. */
	readonly description: string | null;
	/** Files keyed by their names. */
	readonly files: Readonly<Record<string, GistFile>>;
	/** Whether the file map omits files, independently of each file's content truncation. */
	readonly truncated: boolean;
	/** Gist creation time in RFC 3339 format. */
	readonly created_at: string;
	/** Most recent update time in RFC 3339 format. */
	readonly updated_at: string;
	/** Number of comments on the gist. */
	readonly comments: number;
	/** Whether comments are enabled; older GitHub Enterprise versions omit this field. */
	readonly comments_enabled?: boolean;
	/** Owning account; omitted for anonymous gists. */
	readonly owner?: GistOwner;
}

/** Payload accepted by POST /gists. */
export interface CreateGistRequest {
	/** Optional human-readable description. */
	readonly description?: string;
	/** Defaults to false (secret); the API also accepts the legacy strings "true" and "false". */
	readonly public?: boolean | 'true' | 'false';
	/** One or more files keyed by name; names must not contain directory separators. */
	readonly files: Readonly<Record<string, {
		/** File text sent unchanged, including its existing line endings. */
		readonly content: string;
	}>>;
}

/** Operations for retrieving and creating gists. */
export interface IGistsClient {
	/** GET /gists/{gist_id}: read a gist without requiring sign-in. */
	get(gistId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Gist>;

	/** POST /gists: create a gist using a user credential with gist write permission. */
	create(request: CreateGistRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<Gist>;
}
