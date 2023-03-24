/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IExtensionTerminalProfile, ITerminalCommandSelector } from 'vs/platform/terminal/common/terminal';
import { ITerminalQuickFixContributionService } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry, IExtensionPointDescriptor } from 'vs/workbench/services/extensions/common/extensionsRegistry';

const terminalQuickFixesContributionsDescriptor: IExtensionPointDescriptor<ITerminalCommandSelector[]> = {
	extensionPoint: 'terminalQuickFixes',
	defaultExtensionKind: ['workspace'],
	activationEventsGenerator: (terminalQuickFixes: ITerminalCommandSelector[], result: { push(item: string): void }) => {
		for (const quickFixContrib of terminalQuickFixes ?? []) {
			result.push(`onTerminalQuickFixRequest:${quickFixContrib.id}`);
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.terminalQuickFixes', 'Contributes terminal quick fixes.'),
		type: 'array',
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'commandLineMatcher', 'outputMatcher', 'commandExitResult'],
			defaultSnippets: [{
				body: {
					id: '$1',
					commandLineMatcher: '$2',
					outputMatcher: '$3',
					exitStatus: '$4'
				}
			}],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.terminalQuickFixes.id', "The ID of the quick fix provider"),
					type: 'string',
				},
				commandLineMatcher: {
					description: localize('vscode.extension.contributes.terminalQuickFixes.commandLineMatcher', "A regular expression or string to test the command line against"),
					type: 'string',
				},
				outputMatcher: {
					markdownDescription: localize('vscode.extension.contributes.terminalQuickFixes.outputMatcher', "A regular expression or string to match a single line of the output against, which provides groups to be referenced in terminalCommand and uri.\n\nFor example:\n\n `lineMatcher: /git push --set-upstream origin (?<branchName>[^\s]+)/;`\n\n`terminalCommand: 'git push --set-upstream origin ${group:branchName}';`\n"),
					type: 'object',
					required: ['lineMatcher', 'anchor', 'offset', 'length'],
					properties: {
						lineMatcher: {
							description: 'A regular expression or string to test the command line against',
							type: 'string'
						},
						anchor: {
							description: 'Where the search should begin in the buffer',
							enum: ['top', 'bottom']
						},
						offset: {
							description: 'The number of lines vertically from the anchor in the buffer to start matching against',
							type: 'number'
						},
						length: {
							description: 'The number of rows to match against, this should be as small as possible for performance reasons',
							type: 'number'
						}
					}
				},
				commandExitResult: {
					description: localize('vscode.extension.contributes.terminalQuickFixes.commandExitResult', "The command exit result to match on"),
					enum: ['success', 'error'],
					enumDescriptions: [
						'The command exited with an exit code of zero.',
						'The command exited with a non-zero exit code.'
					]
				}
			},
		}
	},
};

const terminalQuickFixesExtPoint = ExtensionsRegistry.registerExtensionPoint<ITerminalCommandSelector[]>(terminalQuickFixesContributionsDescriptor);

export class TerminalQuickFixContributionService implements ITerminalQuickFixContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<IExtensionTerminalProfile> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	terminalQuickFixes: Promise<Array<ITerminalCommandSelector>>;

	constructor() {
		this.terminalQuickFixes = new Promise((r) => terminalQuickFixesExtPoint.setHandler(fixes => {
			const quickFixes = (fixes.filter(c => isProposedApiEnabled(c.description, 'terminalQuickFixProvider')).map(c => c.value ? c.value.map(fix => { return { ...fix, extensionIdentifier: c.description.identifier.value }; }) : [])).flat();
			r(quickFixes);
		}));
	}
}
