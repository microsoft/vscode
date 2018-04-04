/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'git-credential-node' {

	interface Credentials {
		username: string;
		password: string;
	}

	function fill(url: string): Promise<Credentials | null>;
}