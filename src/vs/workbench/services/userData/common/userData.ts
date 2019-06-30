/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';

export interface IUserDataProvider {

	readonly onDidChangeFile: Event<string[]>;

	readFile(path: string): Promise<Uint8Array>;
	writeFile(path: string, content: Uint8Array): Promise<void>;
	deleteFile(path: string): Promise<void>;

	listFiles(path: string): Promise<string[]>;
}