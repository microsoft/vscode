/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { terminalContributionsDescriptor, terminalQuickFixesContributionsDescriptor } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalProfile, ITerminalContributions, ITerminalProfileContribution } from 'vs/platform/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ITerminalCommandSelector } from 'vs/platform/terminal/common/xterm/terminalQuickFix';

// terminal extension point
const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalContributions>(terminalContributionsDescriptor);
const terminalQuickFixesExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalCommandSelector[]>(terminalQuickFixesContributionsDescriptor);

export interface ITerminalContributionService {
	readonly _serviceBrand: undefined;

	readonly terminalProfiles: ReadonlyArray<IExtensionTerminalProfile>;
	readonly terminalQuickFixes: Promise<Array<ITerminalCommandSelector>>;
}

export const ITerminalContributionService = createDecorator<ITerminalContributionService>('terminalContributionsService');

export class TerminalContributionService implements ITerminalContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<IExtensionTerminalProfile> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	terminalQuickFixes: Promise<Array<ITerminalCommandSelector>>;

	constructor() {
		this.terminalQuickFixes = new Promise((r) => terminalQuickFixesExtPoint.setHandler(fixes => {
			const quickFixes = (fixes.filter(c => isProposedApiEnabled(c.description, 'terminalQuickFixProvider')).map(c => c.value ? c.value.map(fix => { return { ...fix, extensionIdentifier: c.description.identifier.value }; }) : [])).flat();
			r(quickFixes);
		}));
		terminalsExtPoint.setHandler(contributions => {
			this._terminalProfiles = contributions.map(c => {
				return c.value?.profiles?.filter(p => hasValidTerminalIcon(p)).map(e => {
					return { ...e, extensionIdentifier: c.description.identifier.value };
				}) || [];
			}).flat();
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
