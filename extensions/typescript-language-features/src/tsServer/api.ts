/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as vscode from 'vscode';


export class API {
	public static fromSimpleString(value: string): API {
		return new API(value, value, value);
	}

	public static readonly defaultVersion = API.fromSimpleString('1.0.0');
	public static readonly v380 = API.fromSimpleString('3.8.0');
	public static readonly v390 = API.fromSimpleString('3.9.0');
	public static readonly v400 = API.fromSimpleString('4.0.0');
	public static readonly v401 = API.fromSimpleString('4.0.1');
	public static readonly v420 = API.fromSimpleString('4.2.0');
	public static readonly v430 = API.fromSimpleString('4.3.0');
	public static readonly v440 = API.fromSimpleString('4.4.0');
	public static readonly v460 = API.fromSimpleString('4.6.0');
	public static readonly v470 = API.fromSimpleString('4.7.0');
	public static readonly v490 = API.fromSimpleString('4.9.0');
	public static readonly v500 = API.fromSimpleString('5.0.0');
	public static readonly v510 = API.fromSimpleString('5.1.0');
	public static readonly v520 = API.fromSimpleString('5.2.0');
	public static readonly v544 = API.fromSimpleString('5.4.4');
	public static readonly v540 = API.fromSimpleString('5.4.0');
	public static readonly v550 = API.fromSimpleString('5.5.0');
	public static readonly v560 = API.fromSimpleString('5.6.0');
	public static readonly v570 = API.fromSimpleString('5.7.0');

	public static fromVersionString(versionString: string): API {
		let version = semver.valid(versionString);
		if (!version) {
			return new API(vscode.l10n.t("invalid version"), '1.0.0', '1.0.0');
		}

		// Cut off any prerelease tag since we sometimes consume those on purpose.
		const index = versionString.indexOf('-');
		if (index >= 0) {
			version = version.substr(0, index);
		}
		return new API(versionString, version, versionString);
	}

	private constructor(
		/**
		 * Human readable string for the current version. Displayed in the UI
		 */
		public readonly displayName: string,

		/**
		 * Semver version, e.g. '3.9.0'
		 */
		public readonly version: string,

		/**
		 * Full version string including pre-release tags, e.g. '3.9.0-beta'
		 */
		public readonly fullVersionString: string,
	) { }

	public eq(other: API): boolean {
		return semver.eq(this.version, other.version);
	}

	public gte(other: API): boolean {
		return semver.gte(this.version, other.version);
	}

	public lt(other: API): boolean {
		return !this.gte(other);
	}

	public isYarnPnp(): boolean {
		return this.fullVersionString.includes('-sdk');
	}
}
