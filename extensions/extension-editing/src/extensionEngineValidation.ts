/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// https://github.com/microsoft/vscode/blob/6cb34eb22385bc93ab25aa2e5113f59c7a2299ac/src/vs/platform/extensions/common/extensionValidator.ts

export interface IParsedVersion {
	hasCaret: boolean;
	hasGreaterEquals: boolean;
	majorBase: number;
	majorMustEqual: boolean;
	minorBase: number;
	minorMustEqual: boolean;
	patchBase: number;
	patchMustEqual: boolean;
	preRelease: string | null;
}

export interface INormalizedVersion {
	majorBase: number;
	majorMustEqual: boolean;
	minorBase: number;
	minorMustEqual: boolean;
	patchBase: number;
	patchMustEqual: boolean;
	notBefore: number; /* milliseconds timestamp, or 0 */
	isMinimum: boolean;
}

const VERSION_REGEXP = /^(\^|>=)?((\d+)|x)\.((\d+)|x)\.((\d+)|x)(\-.*)?$/;
const NOT_BEFORE_REGEXP = /^-(\d{4})(\d{2})(\d{2})$/;

export function isValidVersionStr(version: string): boolean {
	version = version.trim();
	return (version === '*' || VERSION_REGEXP.test(version));
}

export function parseVersion(version: string): IParsedVersion | null {
	if (!isValidVersionStr(version)) {
		return null;
	}

	version = version.trim();

	if (version === '*') {
		return {
			hasCaret: false,
			hasGreaterEquals: false,
			majorBase: 0,
			majorMustEqual: false,
			minorBase: 0,
			minorMustEqual: false,
			patchBase: 0,
			patchMustEqual: false,
			preRelease: null
		};
	}

	const m = version.match(VERSION_REGEXP);
	if (!m) {
		return null;
	}
	return {
		hasCaret: m[1] === '^',
		hasGreaterEquals: m[1] === '>=',
		majorBase: m[2] === 'x' ? 0 : parseInt(m[2], 10),
		majorMustEqual: (m[2] === 'x' ? false : true),
		minorBase: m[4] === 'x' ? 0 : parseInt(m[4], 10),
		minorMustEqual: (m[4] === 'x' ? false : true),
		patchBase: m[6] === 'x' ? 0 : parseInt(m[6], 10),
		patchMustEqual: (m[6] === 'x' ? false : true),
		preRelease: m[8] || null
	};
}

export function normalizeVersion(version: IParsedVersion | null): INormalizedVersion | null {
	if (!version) {
		return null;
	}

	const majorBase = version.majorBase;
	const majorMustEqual = version.majorMustEqual;
	const minorBase = version.minorBase;
	let minorMustEqual = version.minorMustEqual;
	const patchBase = version.patchBase;
	let patchMustEqual = version.patchMustEqual;

	if (version.hasCaret) {
		if (majorBase === 0) {
			patchMustEqual = false;
		} else {
			minorMustEqual = false;
			patchMustEqual = false;
		}
	}

	let notBefore = 0;
	if (version.preRelease) {
		const match = NOT_BEFORE_REGEXP.exec(version.preRelease);
		if (match) {
			const [, year, month, day] = match;
			notBefore = Date.UTC(Number(year), Number(month) - 1, Number(day));
		}
	}

	return {
		majorBase: majorBase,
		majorMustEqual: majorMustEqual,
		minorBase: minorBase,
		minorMustEqual: minorMustEqual,
		patchBase: patchBase,
		patchMustEqual: patchMustEqual,
		isMinimum: version.hasGreaterEquals,
		notBefore,
	};
}
