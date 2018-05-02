/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export interface IAccount {
	login: string;
	isUser: boolean;
	isEnterprise: boolean;
	avatarUrl: string;
	ownedPrivateRepositoryCount?: number;
	privateRepositoryInPlanCount?: number;
}

export class Account implements IAccount {
	constructor(
		public login: string,
		public isUser: boolean,
		public isEnterprise: boolean,
		public avatarUrl: string,
		public ownedPrivateRepositoryCount: number,
		public privateRepositoryInPlanCount: number
	) {

	}
}