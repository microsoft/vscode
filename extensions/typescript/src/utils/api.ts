/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';

export default class API {
	public static readonly defaultVersion = new API('1.0.0');

	private readonly _version: string;

	constructor(
		private readonly _versionString: string
	) {
		this._version = semver.valid(_versionString);
		if (!this._version) {
			this._version = '1.0.0';
		} else {
			// Cut of any prerelease tag since we sometimes consume those
			// on purpose.
			let index = _versionString.indexOf('-');
			if (index >= 0) {
				this._version = this._version.substr(0, index);
			}
		}
	}

	public get versionString(): string {
		return this._versionString;
	}

	public has203Features(): boolean {
		return semver.gte(this._version, '2.0.3');
	}

	public has206Features(): boolean {
		return semver.gte(this._version, '2.0.6');
	}

	public has208Features(): boolean {
		return semver.gte(this._version, '2.0.8');
	}

	public has213Features(): boolean {
		return semver.gte(this._version, '2.1.3');
	}

	public has220Features(): boolean {
		return semver.gte(this._version, '2.2.0');
	}

	public has222Features(): boolean {
		return semver.gte(this._version, '2.2.2');
	}

	public has230Features(): boolean {
		return semver.gte(this._version, '2.3.0');
	}

	public has234Features(): boolean {
		return semver.gte(this._version, '2.3.4');
	}
	public has240Features(): boolean {
		return semver.gte(this._version, '2.4.0');
	}
}