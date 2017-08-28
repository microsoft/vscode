/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export default class API {
	public static readonly defaultVersion = new API('1.0.0', '1.0.0');

	public static fromVersionString(versionString: string): API {
		let version = semver.valid(versionString);
		if (!version) {
			return new API(localize('invalidVersion', 'invalid version'), '1.0.0');
		}

		// Cut of any prerelease tag since we sometimes consume those on purpose.
		const index = versionString.indexOf('-');
		if (index >= 0) {
			version = version.substr(0, index);
		}
		return new API(versionString, version);
	}

	private constructor(
		public readonly versionString: string,
		private readonly version: string
	) { }


	public has203Features(): boolean {
		return semver.gte(this.version, '2.0.3');
	}

	public has206Features(): boolean {
		return semver.gte(this.version, '2.0.6');
	}

	public has208Features(): boolean {
		return semver.gte(this.version, '2.0.8');
	}

	public has213Features(): boolean {
		return semver.gte(this.version, '2.1.3');
	}

	public has220Features(): boolean {
		return semver.gte(this.version, '2.2.0');
	}

	public has222Features(): boolean {
		return semver.gte(this.version, '2.2.2');
	}

	public has230Features(): boolean {
		return semver.gte(this.version, '2.3.0');
	}

	public has234Features(): boolean {
		return semver.gte(this.version, '2.3.4');
	}

	public has240Features(): boolean {
		return semver.gte(this.version, '2.4.0');
	}

	public has250Features(): boolean {
		return semver.gte(this.version, '2.5.0');
	}
}