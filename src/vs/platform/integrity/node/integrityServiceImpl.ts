/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IIntegrityService, IntegrityTestResult, ChecksumPair} from 'vs/platform/integrity/common/integrity';
import product from 'vs/platform/product';
import URI from 'vs/base/common/uri';
import * as fs from 'fs';
const crypto = require('crypto');

interface ILoaderChecksums {
	[scriptSrc:string]: string;
}

export class IntegrityServiceImpl implements IIntegrityService {

	public _serviceBrand: any;
	private _loaderChecksums: ILoaderChecksums;

	constructor() {
		// Fetch checksums from loader
		let loaderChecksums = <ILoaderChecksums>(<any>require).getChecksums();

		// Transform loader checksums to be uri => checksum
		this._loaderChecksums = Object.create(null);
		Object.keys(loaderChecksums).forEach((scriptSrc) => {
			let scriptUri = URI.file(scriptSrc).toString();
			this._loaderChecksums[scriptUri.toString()] = loaderChecksums[scriptSrc];
		});
	}

	public isPure(): TPromise<IntegrityTestResult> {
		const expectedChecksums = product.checksums || {};
		let syncResults: ChecksumPair[] = [];
		let asyncResults: TPromise<ChecksumPair>[] = [];
		Object.keys(expectedChecksums).forEach((filename) => {
			let r = this._resolve(filename, expectedChecksums[filename]);
			if (TPromise.is(r)) {
				asyncResults.push(r);
			} else {
				syncResults.push(r);
			}
		});

		return TPromise.join(asyncResults).then<IntegrityTestResult>((asyncResults) => {
			let allResults = syncResults.concat(asyncResults);
			let isPure = true;
			for (let i = 0, len = allResults.length; isPure && i < len; i++) {
				if (!allResults[i].isPure) {
					isPure = false;
				}
			}

			return {
				isPure: isPure,
				proof: allResults
			};
		});
	}

	private _resolve(filename:string, expected:string): ChecksumPair | TPromise<ChecksumPair> {
		let fileUri = URI.parse(require.toUrl(filename));
		let loaderChecksum = this._loaderChecksums[fileUri.toString()];
		if (loaderChecksum) {
			return IntegrityServiceImpl._createChecksumPair(fileUri, loaderChecksum, expected);
		}
		if (/\.js$/.test(filename)) {
			console.warn(`Did not find checksum for ${filename} in loader checksums.`);
		}
		return new TPromise<ChecksumPair>((c, e, p) => {
			fs.readFile(fileUri.fsPath, (err, buff) => {
				if (err) {
					return e(err);
				}
				c(IntegrityServiceImpl._createChecksumPair(fileUri, this._computeChecksum(buff), expected));
			});
		});
	}

	private _computeChecksum(buff:Buffer): string {
		let hash = crypto
			.createHash('md5')
			.update(buff)
			.digest('base64')
			.replace(/=+$/, '');

		return hash;
	}

	private static _createChecksumPair(uri:URI, actual:string, expected:string): ChecksumPair {
		return {
			uri: uri,
			actual: actual,
			expected: expected,
			isPure: (actual === expected)
		};
	}
}
