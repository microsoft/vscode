/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { isUriComponents, URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalIcon } from './terminal.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isObject, isString, type SingleOrMany } from '../../../base/common/types.js';

export function createProfileSchemaEnums(detectedProfiles: ITerminalProfile[], extensionProfiles?: readonly IExtensionTerminalProfile[]): {
	values: (string | null)[] | undefined;
	markdownDescriptions: string[] | undefined;
} {
	const result: { name: string | null; description: string }[] = [{
		name: null,
		description: localize('terminalAutomaticProfile', 'Automatically detect the default')
	}];
	result.push(...detectedProfiles.map(e => {
		return {
			name: e.profileName,
			description: createProfileDescription(e)
		};
	}));
	if (extensionProfiles) {
		result.push(...extensionProfiles.map(extensionProfile => {
			return {
				name: extensionProfile.title,
				description: createExtensionProfileDescription(extensionProfile)
			};
		}));
	}
	return {
		values: result.map(e => e.name),
		markdownDescriptions: result.map(e => e.description)
	};
}

function createProfileDescription(profile: ITerminalProfile): string {
	let description = `$(${ThemeIcon.isThemeIcon(profile.icon) ? profile.icon.id : profile.icon ? profile.icon : Codicon.terminal.id}) ${profile.profileName}\n- path: ${profile.path}`;
	if (profile.args) {
		if (isString(profile.args)) {
			description += `\n- args: "${profile.args}"`;
		} else {
			description += `\n- args: [${profile.args.length === 0 ? '' : `'${profile.args.join(`','`)}'`}]`;
		}
	}
	if (profile.overrideName !== undefined) {
		description += `\n- overrideName: ${profile.overrideName}`;
	}
	if (profile.color) {
		description += `\n- color: ${profile.color}`;
	}
	if (profile.env) {
		description += `\n- env: ${JSON.stringify(profile.env)}`;
	}
	return description;
}

function createExtensionProfileDescription(profile: IExtensionTerminalProfile): string {
	const description = `$(${ThemeIcon.isThemeIcon(profile.icon) ? profile.icon.id : profile.icon ? profile.icon : Codicon.terminal.id}) ${profile.title}\n- extensionIdentifier: ${profile.extensionIdentifier}`;
	return description;
}


export function terminalProfileArgsMatch(args1: SingleOrMany<string> | undefined, args2: SingleOrMany<string> | undefined): boolean {
	if (!args1 && !args2) {
		return true;
	} else if (isString(args1) && isString(args2)) {
		return args1 === args2;
	} else if (Array.isArray(args1) && Array.isArray(args2)) {
		if (args1.length !== args2.length) {
			return false;
		}
		for (let i = 0; i < args1.length; i++) {
			if (args1[i] !== args2[i]) {
				return false;
			}
		}
		return true;
	}
	return false;
}

export function terminalIconsEqual(a?: TerminalIcon, b?: TerminalIcon): boolean {
	if (!a && !b) {
		return true;
	} else if (!a || !b) {
		return false;
	}

	if (ThemeIcon.isThemeIcon(a) && ThemeIcon.isThemeIcon(b)) {
		return a.id === b.id && a.color === b.color;
	}
	if (
		isObject(a) && !URI.isUri(a) && !ThemeIcon.isThemeIcon(a) &&
		isObject(b) && !URI.isUri(b) && !ThemeIcon.isThemeIcon(b)
	) {
		const castedA = (a as { light: unknown; dark: unknown });
		const castedB = (b as { light: unknown; dark: unknown });
		if ((URI.isUri(castedA.light) || isUriComponents(castedA.light)) && (URI.isUri(castedA.dark) || isUriComponents(castedA.dark))
			&& (URI.isUri(castedB.light) || isUriComponents(castedB.light)) && (URI.isUri(castedB.dark) || isUriComponents(castedB.dark))) {
			return castedA.light.path === castedB.light.path && castedA.dark.path === castedB.dark.path;
		}
	}
	if ((URI.isUri(a) && URI.isUri(b)) || (isUriComponents(a) || isUriComponents(b))) {
		const castedA = (a as { scheme: unknown; path: unknown });
		const castedB = (b as { scheme: unknown; path: unknown });
		return castedA.path === castedB.path && castedA.scheme === castedB.scheme;
	}

	return false;
}
