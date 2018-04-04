/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitRemoteURL } from './remote';

export class Repository {
	public path: string;

	public remotes: IGitRemoteURL[];

	constructor(path: string, remotes: IGitRemoteURL[]) {
		this.path = path;
		this.remotes = remotes;
	}
}