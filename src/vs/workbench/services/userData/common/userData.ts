/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { VSBuffer } from 'vs/base/common/buffer';

export interface IUserDataProvider {

	onDidChangeFile: Event<string[]>;

	readFile(path: string): Promise<VSBuffer>;

	readDirectory(path: string): Promise<string[]>;

	writeFile(path: string, content: VSBuffer): Promise<void>;

	delete(path: string): Promise<void>;
}