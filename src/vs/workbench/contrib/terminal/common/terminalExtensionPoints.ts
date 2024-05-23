/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { terminalContributionsDescriptor } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalProfile, ITerminalContributions, ITerminalProfileContribution } from 'vs/platform/terminal/common/terminal';
import { URI } from 'vs/base/common/uri';

// terminal extension point
const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalContributions>(terminalContributionsDescriptor);

export interface ITerminalContributionService {
	readonly _serviceBrand: undefined;

	readonly terminalProfiles: ReadonlyArray<IExtensionTerminalProfile>;
}

export const ITerminalContributionService = createDecorator<ITerminalContributionService>('terminalContributionsService');

export class TerminalContributionService implements ITerminalContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<IExtensionTerminalProfile> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	constructor() {
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
