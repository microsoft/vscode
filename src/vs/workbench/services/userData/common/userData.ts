/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { TernarySearchTree } from 'vs/base/common/map';

export const IUserDataService = createDecorator<IUserDataService>('userDataService');

export interface IUserDataChangesEvent {
	keys: string[];
	contains(keyOrSegment: string): boolean;
}

export interface IUserDataService {
	_serviceBrand: any;

	onDidChange: Event<IUserDataChangesEvent>;

	toResource(key: string): URI;

	toKey(resource: URI): string | undefined;

	read(key: string): Promise<string>;

	write(key: string, value: string): Promise<void>;
}

export interface IUserDataProvider {

	onDidChange: Event<string>;

	read(key: string): Promise<string>;

	write(key: string, value: string): Promise<void>;

}

export class UserDataChangesEvent implements IUserDataChangesEvent {

	private _keysTree: TernarySearchTree<string> | undefined = undefined;

	constructor(readonly keys: string[]) { }

	private get keysTree(): TernarySearchTree<string> {
		if (!this._keysTree) {
			this._keysTree = TernarySearchTree.forPaths<string>();
			for (const key of this.keys) {
				this._keysTree.set(key, key);
			}
		}
		return this._keysTree;
	}

	contains(keyOrSegment: string): boolean {
		return this.keysTree.findSubstr(keyOrSegment) !== undefined;
	}

}