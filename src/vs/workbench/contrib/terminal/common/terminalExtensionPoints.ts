/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ITerminalContributions, terminalContributionsDescriptor, ITerminalProfileContribution } from 'vs/workbench/contrib/terminal/common/terminal';
import { flatten } from 'vs/base/common/arrays';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { iconRegistry } from 'vs/base/common/codicons';

// terminal extension point
export const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalContributions>(terminalContributionsDescriptor);

export interface ITerminalContributionService {
	readonly _serviceBrand: undefined;

	readonly terminalProfiles: ReadonlyArray<ITerminalProfileContribution & { extensionIdentifier: string }>;
}

export const ITerminalContributionService = createDecorator<ITerminalContributionService>('terminalContributionsService');

export class TerminalContributionService implements ITerminalContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<ITerminalProfileContribution & { extensionIdentifier: string }> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	constructor() {
		terminalsExtPoint.setHandler(contributions => {
			this._terminalProfiles = flatten(contributions.map(c => {
				return c.value?.profiles?.map(e => {
					// Only support $(id) for now, without that it should point to a path to be
					// consistent with other icon APIs
					if (e.icon && e.icon.startsWith('$(') && e.icon.endsWith(')')) {
						e.icon = e.icon.substr(2, e.icon.length - 3);
					} else if (e.icon && iconRegistry.get(e.icon)) {
						e.icon = e.icon;
					} else {
						e.icon = undefined;
					}
					return { ...e, extensionIdentifier: c.description.identifier.value };
				}) || [];
			}));
		});
	}
}
