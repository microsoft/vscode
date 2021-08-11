/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { IExtensionTerminalProfile, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export function createProfileSchemaEnums(detectedProfiles: ITerminalProfile[], extensionProfiles?: readonly IExtensionTerminalProfile[]): {
	values: string[] | undefined,
	markdownDescriptions: string[] | undefined
} {
	const result = detectedProfiles.map(e => {
		return {
			name: e.profileName,
			description: createProfileDescription(e)
		};
	});
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
		if (typeof profile.args === 'string') {
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
	let description = `$(${ThemeIcon.isThemeIcon(profile.icon) ? profile.icon.id : profile.icon ? profile.icon : Codicon.terminal.id}) ${profile.title}\n- extensionIdenfifier: ${profile.extensionIdentifier}`;
	return description;
}
