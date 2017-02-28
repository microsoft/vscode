/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { join } from 'path';
import { writeFile } from 'vs/base/node/pfs';

export function startProfiling(name: string): TPromise<boolean> {
	return lazyV8Profiler.value.then(profiler => {
		profiler.startProfiling(name);
		return true;
	});
}

export function stopProfiling(dir: string, prefix: string): TPromise<string> {
	return lazyV8Profiler.value.then(profiler => {
		return profiler.stopProfiling();
	}).then(profile => {
		return new TPromise<any>((resolve, reject) => {
			profile.export(function (error, result) {
				profile.delete();
				if (error) {
					reject(error);
					return;
				}
				const filepath = join(dir, `${prefix}_${profile.title}.cpuprofile.txt`);
				writeFile(filepath, result).then(() => resolve(filepath), reject);
			});
		});
	});
}

declare interface Profiler {
	startProfiling(name: string);
	stopProfiling(): Profile;
}

declare interface Profile {
	title: string;
	export(callback: (err, data) => void);
	delete();
}

const lazyV8Profiler = new class {
	private _value: TPromise<Profiler>;
	get value() {
		if (!this._value) {
			this._value = new TPromise((resolve, reject) => {
				require(['v8-profiler'], resolve, reject);
			});
		}
		return this._value;
	}
};
