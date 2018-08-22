/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { API } from './git';
import * as semver from 'semver';

interface ApiCtor {
	new(model: Model): API;
}

const versions: string[] = [];
const apis = new Map<string, ApiCtor>();

export function getAPI(model: Model, range: string): API {
	if (!range) {
		throw new Error(`Please provide a Git extension API version range. Available versions: [${versions.join(', ')}]`);
	}

	const version = semver.maxSatisfying(versions, range);

	if (!version) {
		throw new Error(`There's no available Git extension API for the given range: '${range}'. Available versions: [${versions.join(', ')}]`);
	}

	const api = apis.get(version)!;
	return new api(model);
}

export function Api(version: string): Function {
	return function (ctor: ApiCtor) {
		if (apis.has(version)) {
			throw new Error(`Git extension API version ${version} already registered.`);
		}

		versions.push(version);
		apis.set(version, ctor);
	};
}

export function deprecated(target: any, key: string, descriptor: any): void {
	if (typeof descriptor.value !== 'function') {
		throw new Error('not supported');
	}

	const fn = descriptor.value;
	descriptor.value = function () {
		console.warn(`Git extension API method '${key}' is deprecated.`);
		return fn.apply(this, arguments);
	};
}