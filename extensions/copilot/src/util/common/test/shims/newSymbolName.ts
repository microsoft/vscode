/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum NewSymbolNameTag {
	AIGenerated = 1
}

export enum NewSymbolNameTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

export class NewSymbolName {
	readonly newSymbolName: string;
	readonly tags?: readonly NewSymbolNameTag[];

	constructor(newSymbolName: string, tags?: readonly NewSymbolNameTag[]) {
		this.newSymbolName = newSymbolName;
		this.tags = tags;
	}
}
