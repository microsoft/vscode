/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Remote } from './remote';

export class Repository {
	public path: string;

	public remotes: Remote[];

	constructor(path: string, remotes: Remote[]) {
		this.path = path;
		this.remotes = remotes;
	}
}