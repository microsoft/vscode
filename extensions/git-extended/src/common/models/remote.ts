/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from github/desktop, obtained from
 * https://github.com/desktop/desktop/blob/master/app/src/models/remote.ts
 * ------------------------------------------------------------------------------------------ */

export interface IRemote {
	readonly name: string;
	readonly url: string;
}

export interface IGitRemoteURL {
	/** The hostname of the remote. */
	readonly hostname: string;

	/**
	 * The owner of the GitHub repository. This will be null if the URL doesn't
	 * take the form of a GitHub repository URL (e.g., owner/name).
	 */
	readonly owner: string | null;

	/**
	 * The name of the GitHub repository. This will be null if the URL doesn't
	 * take the form of a GitHub repository URL (e.g., owner/name).
	 */
	readonly name: string | null;
}
