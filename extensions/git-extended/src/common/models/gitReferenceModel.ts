/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriString } from './uriString';

export class GitReferenceModel {
	public repositoryCloneUrl: UriString;
	constructor(
		public ref: string,
		public label: string,
		public sha: string,
		repositoryCloneUrl: string
	) {
		this.repositoryCloneUrl = new UriString(repositoryCloneUrl);
	}
}