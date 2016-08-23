/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IMirrorModel} from 'vs/editor/common/editorCommon';
import {IResourceService} from 'vs/editor/common/services/resourceService';

class MirrorModelMap {

	private _data: {[key:string]:IMirrorModel};

	constructor() {
		this._data = {};
	}

	public set(key:string, data:IMirrorModel): void {
		this._data[key] = data;
	}

	public get(key:string): IMirrorModel {
		return this._data[key] || null;
	}

	public contains(key:string): boolean {
		return !!this._data[key];
	}

	public remove(key:string): void {
		delete this._data[key];
	}
}

export class ResourceService implements IResourceService {
	public _serviceBrand: any;

	private _map:MirrorModelMap;

	constructor() {
		this._map = new MirrorModelMap();
	}

	private static _anonymousModelId(input:string): string {
		let r = '';
		for (let i = 0; i < input.length; i++) {
			let ch = input[i];
			if (ch >= '0' && ch <= '9') {
				r += '0';
				continue;
			}
			if (ch >= 'a' && ch <= 'z') {
				r += 'a';
				continue;
			}
			if (ch >= 'A' && ch <= 'Z') {
				r += 'A';
				continue;
			}
			r += ch;
		}
		return r;
	}

	public insert(uri:URI, element:IMirrorModel): void {
		let key = uri.toString();

		if (this._map.contains(key)) {
			// There already exists a model with this id => this is a programmer error
			throw new Error('ResourceService: Cannot add model ' + ResourceService._anonymousModelId(key) + ' because it already exists!');
		}
		this._map.set(key, element);
	}

	public get(uri:URI):IMirrorModel {
		let key = uri.toString();

		return this._map.get(key);
	}

	public remove(uri:URI):void {
		let key = uri.toString();

		this._map.remove(key);
	}
}
