/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export interface IDataTransferFile {
	readonly name: string;
	readonly uri?: URI;
	data(): Promise<Uint8Array>;
}

export interface IDataTransferItem {
	asString(): Thenable<string>;
	asFile(): IDataTransferFile | undefined;
	value: any;
}

export type IDataTransfer = Map<string, IDataTransferItem>;
