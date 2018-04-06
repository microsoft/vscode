/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Remote {
	constructor(
		public readonly remoteName: string,
		public readonly url: string,
		public readonly hostname: string,
		public readonly owner: string,
		public readonly name: string
	) { }
}
