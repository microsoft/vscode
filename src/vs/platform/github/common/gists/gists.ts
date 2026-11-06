/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions } from '../client/request.js';

/** A gist file and its inline content. */
export interface GistFile {
	/** Whether the inline content contains only part of the file. */
	readonly truncated: boolean;
	/** Inline file content in the declared encoding; it may be truncated. */
	readonly content: string;
	/** Binary files use base64 even when the default JSON representation is requested. */
	readonly encoding: 'utf-8' | 'base64';
}

/** Gist metadata and files. */
export interface Gist {
	/** Opaque gist identifier accepted by the REST API. */
	readonly id: string;
	/** Browser URL for the gist. */
	readonly html_url: string;
	/** Files keyed by their names. */
	readonly files: Readonly<Record<string, GistFile>>;
}

/** Payload accepted by POST /gists. */
export interface CreateGistRequest {
	/** Defaults to false for a secret gist, accessible to anyone who knows its URL. */
	readonly public?: boolean;
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
