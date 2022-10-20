/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTerminalQuickFix } from 'vs/platform/terminal/common/terminal';
import { terminalsExtPoint } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';

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
		terminalsExtPoint.setHandler(contributions => {
			for (const c of contributions) {
				const fixes = c.value.quickFixes;
				if (fixes) {
					for (const fix of fixes) {
						this._quickFixes.push(
							{
								...fix,
								extensionIdentifier: c.description.identifier.value
							});
					}
				}
			}
			return this._quickFixes;
		});
	}
}
