/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { terminalContributionsDescriptor } from 'vs/workbench/contrib/terminal/common/terminal';
import { flatten } from 'vs/base/common/arrays';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalProfile, IExtensionTerminalQuickFix, ITerminalContributions, ITerminalProfileContribution } from 'vs/platform/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
export const GitPushCommandLineRegex = /git\s+push/;
export const GitPushOutputRegex = /git push --set-upstream origin (?<branch>[^\s]+)/;

// terminal extension point
export const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalContributions>(terminalContributionsDescriptor);

export interface ITerminalContributionService {
	readonly _serviceBrand: undefined;

	readonly terminalProfiles: ReadonlyArray<IExtensionTerminalProfile>;
	readonly quickFixes: Array<IExtensionTerminalQuickFix>;
}

export const ITerminalContributionService = createDecorator<ITerminalContributionService>('terminalContributionsService');

export class TerminalContributionService implements ITerminalContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<IExtensionTerminalProfile> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	private _quickFixes: Array<IExtensionTerminalQuickFix> = [];
	get quickFixes() { return this._quickFixes; }

	constructor() {
		terminalsExtPoint.setHandler(contributions => {
			this._terminalProfiles = flatten(contributions.map(c => {
				return c.value?.profiles?.filter(p => hasValidTerminalIcon(p)).map(e => {
					return { ...e, extensionIdentifier: c.description.identifier.value };
				}) || [];
			}));
			this._quickFixes = flatten(contributions.map(c => c.value.quickFixes ? c.value.quickFixes.map(fix => { return { ...fix, extensionIdentifier: c.description.identifier.value }; }) : []));
			this._quickFixes.push({
				id: 'Git Push Set Upstream',
				commandLineMatcher: GitPushCommandLineRegex,
				outputMatcher: {
					lineMatcher: GitPushOutputRegex,
					anchor: 'bottom',
					offset: 0,
					length: 5
				},
				exitStatus: false,
				extensionIdentifier: 'Git',
				commandToRun: 'git push --set-upstream origin {branch}'
			});
		});
	}
}

function hasValidTerminalIcon(profile: ITerminalProfileContribution): boolean {
	return !profile.icon ||
		(
			typeof profile.icon === 'string' ||
			URI.isUri(profile.icon) ||
			(
				'light' in profile.icon && 'dark' in profile.icon &&
				URI.isUri(profile.icon.light) && URI.isUri(profile.icon.dark)
			)
		);
}
