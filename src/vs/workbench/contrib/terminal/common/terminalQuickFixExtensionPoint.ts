/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { terminalContributionsDescriptor } from 'vs/workbench/contrib/terminal/common/terminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalQuickFix, ITerminalQuickFixContribution } from 'vs/platform/terminal/common/terminal';

export const terminalQuickFixExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalQuickFixContribution>(terminalContributionsDescriptor);

export interface ITerminalQuickFixContributionsService {
	readonly _serviceBrand: undefined;

	readonly quickFixes: Array<IExtensionTerminalQuickFix>;
}

export const ITerminalQuickFixContributionsService = createDecorator<ITerminalQuickFixContributionsService>('terminalQuickFixContributionsService');

export class TerminalQuickFixContributionService implements ITerminalQuickFixContributionsService {
	declare _serviceBrand: undefined;

	private _quickFixes: Array<IExtensionTerminalQuickFix> = [];
	get quickFixes() { return this._quickFixes; }

	constructor() {
		terminalQuickFixExtPoint.setHandler(contributions => {
			for (const c of contributions) {
				const fix = c.value;
				this._quickFixes.push({
					id: fix.id,
					commandLineMatcher: fix.commandLineMatcher,
					outputMatcher: fix.outputMatcher,
					commandToRun: fix.commandToRun,
					linkToOpen: fix.linkToOpen,
					extensionIdentifier: c.description.identifier.value
				});
			}
			return this._quickFixes;
		});
	}
}
