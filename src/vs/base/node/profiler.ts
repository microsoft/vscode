/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { join, basename } from 'path';
import { writeFile } from 'vs/base/node/pfs';

export function startProfiling(name: string): TPromise<boolean> {
	return lazyV8Profiler.value.then(profiler => {
		profiler.startProfiling(name);
		return true;
	});
}

const _isRunningOutOfDev = process.env['VSCODE_DEV'];

export function stopProfiling(dir: string, prefix: string): TPromise<string> {
	return lazyV8Profiler.value.then(profiler => {
		return profiler.stopProfiling();
	}).then(profile => {
		return new TPromise<any>((resolve, reject) => {

			// remove pii paths
			if (!_isRunningOutOfDev) {
				removePiiPaths(profile); // remove pii from our users
			}

			profile.export(function (error, result) {
				profile.delete();
				if (error) {
					reject(error);
					return;
				}
				let filepath = join(dir, `${prefix}_${profile.title}.cpuprofile`);
				if (!_isRunningOutOfDev) {
					filepath += '.txt'; // github issues must be: txt, zip, png, gif
				}
				writeFile(filepath, result).then(() => resolve(filepath), reject);
			});
		});
	});
}

function removePiiPaths(profile: Profile) {
	const stack = [profile.head];
	while (stack.length > 0) {
		const element = stack.pop();
		if (element.url) {
			const shortUrl = basename(element.url);
			if (element.url !== shortUrl) {
				element.url = `pii_removed/${shortUrl}`;
			}
		}
		if (element.children) {
			stack.push(...element.children);
		}
	}
}

declare interface Profiler {
	startProfiling(name: string);
	stopProfiling(): Profile;
}

declare interface Profile {
	title: string;
	export(callback: (err, data) => void);
	delete();
	head: ProfileSample;
}

declare interface ProfileSample {
	// bailoutReason:""
	// callUID:2333
	// children:Array[39]
	// functionName:"(root)"
	// hitCount:0
	// id:1
	// lineNumber:0
	// scriptId:0
	// url:""
	url: string;
	children: ProfileSample[];
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
