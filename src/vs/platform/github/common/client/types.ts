/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A JSON value in an extensible API payload. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** A JSON object whose property names are defined by the producing service. */
export interface JsonObject {
	/** A named JSON value preserved without interpreting its schema. */
	readonly [key: string]: JsonValue;
}

/** Maximum number of items per page for REST API pagination. */
export const MAX_PER_PAGE = 100;

/** Query parameters selecting one page of a REST collection. */
export interface PageOptions {
	/** The one-based page number, defaulting to 1. */
	readonly page?: number;
	/** The number of results per page, from 1 to 100 and defaulting to 30. */
	readonly per_page?: number;
}

/** A repository addressed by its owner login and name. */
export interface RepositoryRef {
	/** The repository owner's login, compared case-insensitively. */
	readonly owner: string;
	/** The repository name, compared case-insensitively. */
	readonly name: string;
}
