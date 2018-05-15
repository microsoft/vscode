/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Protocol } from './protocol';

export class GitHubRef {
	public repositoryCloneUrl: Protocol;
	constructor(
		public ref: string,
		public label: string,
		public sha: string,
		repositoryCloneUrl: string
	) {
		this.repositoryCloneUrl = new Protocol(repositoryCloneUrl);
	}
}
