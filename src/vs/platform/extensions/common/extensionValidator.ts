/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent, joinPath } from '../../../base/common/resources.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import * as nls from '../../../nls.js';
import * as semver from '../../../base/common/semver/semver.js';
import { IExtensionManifest, parseApiProposals } from './extensions.js';
import { allApiProposals } from './extensionsApiProposals.js';

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

export function isValidVersion(_inputVersion: string | INormalizedVersion, _inputDate: ProductDate, _desiredVersion: string | INormalizedVersion): boolean {
	let version: INormalizedVersion | null;
	if (typeof _inputVersion === 'string') {
		version = normalizeVersion(parseVersion(_inputVersion));
	} else {
		version = _inputVersion;
	}

	let productTs: number | undefined;
	if (_inputDate instanceof Date) {
		productTs = _inputDate.getTime();
	} else if (typeof _inputDate === 'string') {
		productTs = new Date(_inputDate).getTime();
	}

	let desiredVersion: INormalizedVersion | null;
	if (typeof _desiredVersion === 'string') {
		desiredVersion = normalizeVersion(parseVersion(_desiredVersion));
	} else {
		desiredVersion = _desiredVersion;
	}

	if (!version || !desiredVersion) {
		return false;
	}

	const majorBase = version.majorBase;
	const minorBase = version.minorBase;
	const patchBase = version.patchBase;

	let desiredMajorBase = desiredVersion.majorBase;
	let desiredMinorBase = desiredVersion.minorBase;
	let desiredPatchBase = desiredVersion.patchBase;
	const desiredNotBefore = desiredVersion.notBefore;

	let majorMustEqual = desiredVersion.majorMustEqual;
	let minorMustEqual = desiredVersion.minorMustEqual;
	let patchMustEqual = desiredVersion.patchMustEqual;

	if (desiredVersion.isMinimum) {
		if (majorBase > desiredMajorBase) {
			return true;
		}

		if (majorBase < desiredMajorBase) {
			return false;
		}

		if (minorBase > desiredMinorBase) {
			return true;
		}

		if (minorBase < desiredMinorBase) {
			return false;
		}

		if (productTs && productTs < desiredNotBefore) {
			return false;
		}

		return patchBase >= desiredPatchBase;
	}

	// Anything < 1.0.0 is compatible with >= 1.0.0, except exact matches
	if (majorBase === 1 && desiredMajorBase === 0 && (!majorMustEqual || !minorMustEqual || !patchMustEqual)) {
		desiredMajorBase = 1;
		desiredMinorBase = 0;
		desiredPatchBase = 0;
		majorMustEqual = true;
		minorMustEqual = false;
		patchMustEqual = false;
	}

	if (majorBase < desiredMajorBase) {
		// smaller major version
		return false;
	}

	if (majorBase > desiredMajorBase) {
		// higher major version
		return (!majorMustEqual);
	}

	// at this point, majorBase are equal

	if (minorBase < desiredMinorBase) {
		// smaller minor version
		return false;
	}

	if (minorBase > desiredMinorBase) {
		// higher minor version
		return (!minorMustEqual);
	}

	// at this point, minorBase are equal

	if (patchBase < desiredPatchBase) {
		// smaller patch version
		return false;
	}

	if (patchBase > desiredPatchBase) {
		// higher patch version
		return (!patchMustEqual);
	}

	// at this point, patchBase are equal

	if (productTs && productTs < desiredNotBefore) {
		return false;
	}

	return true;
}

type ProductDate = string | Date | undefined;

export function validateExtensionManifest(productVersion: string, productDate: ProductDate, extensionLocation: URI, extensionManifest: IExtensionManifest, extensionIsBuiltin: boolean, validateApiVersion: boolean): readonly [Severity, string][] {
	const validations: [Severity, string][] = [];
	if (typeof extensionManifest.publisher !== 'undefined' && typeof extensionManifest.publisher !== 'string') {
		validations.push([Severity.Error, nls.localize('extensionDescription.publisher', "property publisher must be of type `string`.")]);
		return validations;
	}
	if (typeof extensionManifest.name !== 'string') {
		validations.push([Severity.Error, nls.localize('extensionDescription.name', "property `{0}` is mandatory and must be of type `string`", 'name')]);
		return validations;
	}
	if (typeof extensionManifest.version !== 'string') {
		validations.push([Severity.Error, nls.localize('extensionDescription.version', "property `{0}` is mandatory and must be of type `string`", 'version')]);
		return validations;
	}
	if (!extensionManifest.engines) {
		validations.push([Severity.Error, nls.localize('extensionDescription.engines', "property `{0}` is mandatory and must be of type `object`", 'engines')]);
		return validations;
	}
	if (typeof extensionManifest.engines.vscode !== 'string') {
		validations.push([Severity.Error, nls.localize('extensionDescription.engines.vscode', "property `{0}` is mandatory and must be of type `string`", 'engines.vscode')]);
		return validations;
	}
	if (typeof extensionManifest.extensionDependencies !== 'undefined') {
		if (!isStringArray(extensionManifest.extensionDependencies)) {
			validations.push([Severity.Error, nls.localize('extensionDescription.extensionDependencies', "property `{0}` can be omitted or must be of type `string[]`", 'extensionDependencies')]);
			return validations;
		}
	}
	if (typeof extensionManifest.activationEvents !== 'undefined') {
		if (!isStringArray(extensionManifest.activationEvents)) {
			validations.push([Severity.Error, nls.localize('extensionDescription.activationEvents1', "property `{0}` can be omitted or must be of type `string[]`", 'activationEvents')]);
			return validations;
		}
		if (typeof extensionManifest.main === 'undefined' && typeof extensionManifest.browser === 'undefined') {
			validations.push([Severity.Error, nls.localize('extensionDescription.activationEvents2', "property `{0}` should be omitted if the extension doesn't have a `{1}` or `{2}` property.", 'activationEvents', 'main', 'browser')]);
			return validations;
		}
	}
	if (typeof extensionManifest.extensionKind !== 'undefined') {
		if (typeof extensionManifest.main === 'undefined') {
			validations.push([Severity.Warning, nls.localize('extensionDescription.extensionKind', "property `{0}` can be defined only if property `main` is also defined.", 'extensionKind')]);
			// not a failure case
		}
	}
	if (typeof extensionManifest.main !== 'undefined') {
		if (typeof extensionManifest.main !== 'string') {
			validations.push([Severity.Error, nls.localize('extensionDescription.main1', "property `{0}` can be omitted or must be of type `string`", 'main')]);
			return validations;
		} else {
			const mainLocation = joinPath(extensionLocation, extensionManifest.main);
			if (!isEqualOrParent(mainLocation, extensionLocation)) {
				validations.push([Severity.Warning, nls.localize('extensionDescription.main2', "Expected `main` ({0}) to be included inside extension's folder ({1}). This might make the extension non-portable.", mainLocation.path, extensionLocation.path)]);
				// not a failure case
			}
		}
	}
	if (typeof extensionManifest.browser !== 'undefined') {
		if (typeof extensionManifest.browser !== 'string') {
			validations.push([Severity.Error, nls.localize('extensionDescription.browser1', "property `{0}` can be omitted or must be of type `string`", 'browser')]);
			return validations;
		} else {
			const browserLocation = joinPath(extensionLocation, extensionManifest.browser);
			if (!isEqualOrParent(browserLocation, extensionLocation)) {
				validations.push([Severity.Warning, nls.localize('extensionDescription.browser2', "Expected `browser` ({0}) to be included inside extension's folder ({1}). This might make the extension non-portable.", browserLocation.path, extensionLocation.path)]);
				// not a failure case
			}
		}
	}

	if (!semver.valid(extensionManifest.version)) {
		validations.push([Severity.Error, nls.localize('notSemver', "Extension version is not semver compatible.")]);
		return validations;
	}

	const notices: string[] = [];
	const validExtensionVersion = isValidExtensionVersion(productVersion, productDate, extensionManifest, extensionIsBuiltin, notices);
	if (!validExtensionVersion) {
		for (const notice of notices) {
			validations.push([Severity.Error, notice]);
		}
	}

	if (validateApiVersion && extensionManifest.enabledApiProposals?.length) {
		const incompatibleNotices: string[] = [];
		if (!areApiProposalsCompatible([...extensionManifest.enabledApiProposals], incompatibleNotices)) {
			for (const notice of incompatibleNotices) {
				validations.push([Severity.Error, notice]);
			}
		}
	}

	return validations;
}

export function isValidExtensionVersion(productVersion: string, productDate: ProductDate, extensionManifest: IExtensionManifest, extensionIsBuiltin: boolean, notices: string[]): boolean {

	if (extensionIsBuiltin || (typeof extensionManifest.main === 'undefined' && typeof extensionManifest.browser === 'undefined')) {
		// No version check for builtin or declarative extensions
		return true;
	}

	return isVersionValid(productVersion, productDate, extensionManifest.engines.vscode, notices);
}

export function isEngineValid(engine: string, version: string, date: ProductDate): boolean {
	// TODO@joao: discuss with alex '*' doesn't seem to be a valid engine version
	return engine === '*' || isVersionValid(version, date, engine);
}

export function areApiProposalsCompatible(apiProposals: string[]): boolean;
export function areApiProposalsCompatible(apiProposals: string[], notices: string[]): boolean;
export function areApiProposalsCompatible(apiProposals: string[], productApiProposals: Readonly<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>): boolean;
export function areApiProposalsCompatible(apiProposals: string[], arg1?: any): boolean {
	if (apiProposals.length === 0) {
		return true;
	}
	const notices: string[] | undefined = Array.isArray(arg1) ? arg1 : undefined;
	const productApiProposals: Readonly<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }> = (notices ? undefined : arg1) ?? allApiProposals;
	const incompatibleProposals: string[] = [];
	const parsedProposals = parseApiProposals(apiProposals);
	for (const { proposalName, version } of parsedProposals) {
		const existingProposal = productApiProposals[proposalName];
		if (!existingProposal) {
			continue;
		}
		if (!version) {
			continue;
		}
		if (existingProposal.version !== version) {
			incompatibleProposals.push(proposalName);
		}
	}
	if (incompatibleProposals.length) {
		if (notices) {
			if (incompatibleProposals.length === 1) {
				notices.push(nls.localize('apiProposalMismatch1', "This extension is using the API proposal '{0}' that is not compatible with the current version of VS Code.", incompatibleProposals[0]));
			} else {
				notices.push(nls.localize('apiProposalMismatch2', "This extension is using the API proposals {0} and '{1}' that are not compatible with the current version of VS Code.",
					incompatibleProposals.slice(0, incompatibleProposals.length - 1).map(p => `'${p}'`).join(', '),
					incompatibleProposals[incompatibleProposals.length - 1]));
			}
		}
		return false;
	}
	return true;
}

function isVersionValid(currentVersion: string, date: ProductDate, requestedVersion: string, notices: string[] = []): boolean {

	const desiredVersion = normalizeVersion(parseVersion(requestedVersion));
	if (!desiredVersion) {
		notices.push(nls.localize('versionSyntax', "Could not parse `engines.vscode` value {0}. Please use, for example: ^1.22.0, ^1.22.x, etc.", requestedVersion));
		return false;
	}

	// enforce that a breaking API version is specified.
	// for 0.X.Y, that means up to 0.X must be specified
	// otherwise for Z.X.Y, that means Z must be specified
	if (desiredVersion.majorBase === 0) {
		// force that major and minor must be specific
		if (!desiredVersion.majorMustEqual || !desiredVersion.minorMustEqual) {
			notices.push(nls.localize('versionSpecificity1', "Version specified in `engines.vscode` ({0}) is not specific enough. For vscode versions before 1.0.0, please define at a minimum the major and minor desired version. E.g. ^0.10.0, 0.10.x, 0.11.0, etc.", requestedVersion));
			return false;
		}
	} else {
		// force that major must be specific
		if (!desiredVersion.majorMustEqual) {
			notices.push(nls.localize('versionSpecificity2', "Version specified in `engines.vscode` ({0}) is not specific enough. For vscode versions after 1.0.0, please define at a minimum the major desired version. E.g. ^1.10.0, 1.10.x, 1.x.x, 2.x.x, etc.", requestedVersion));
			return false;
		}
	}

	if (!isValidVersion(currentVersion, date, desiredVersion)) {
		notices.push(nls.localize('versionMismatch', "Extension is not compatible with Code {0}. Extension requires: {1}.", currentVersion, requestedVersion));
		return false;
	}

	return true;
}

function isStringArray(arr: string[]): boolean {
	if (!Array.isArray(arr)) {
		return false;
	}
	for (let i = 0, len = arr.length; i < len; i++) {
		if (typeof arr[i] !== 'string') {
			return false;
		}
	}
	return true;
}
