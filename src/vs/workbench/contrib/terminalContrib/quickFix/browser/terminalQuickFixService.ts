/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ITerminalCommandSelector } from 'vs/platform/terminal/common/terminal';
import { ITerminalQuickFixService, ITerminalQuickFixProvider, ITerminalQuickFixProviderSelector } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export class TerminalQuickFixService implements ITerminalQuickFixService {
	declare _serviceBrand: undefined;

	private _selectors: Map<string, ITerminalCommandSelector> = new Map();

	private _providers: Map<string, ITerminalQuickFixProvider> = new Map();
	get providers(): Map<string, ITerminalQuickFixProvider> { return this._providers; }

	private readonly _onDidRegisterProvider = new Emitter<ITerminalQuickFixProviderSelector>();
	readonly onDidRegisterProvider = this._onDidRegisterProvider.event;
	private readonly _onDidRegisterCommandSelector = new Emitter<ITerminalCommandSelector>();
	readonly onDidRegisterCommandSelector = this._onDidRegisterCommandSelector.event;
	private readonly _onDidUnregisterProvider = new Emitter<string>();
	readonly onDidUnregisterProvider = this._onDidUnregisterProvider.event;

	readonly extensionQuickFixes: Promise<Array<ITerminalCommandSelector>>;

	constructor() {
		this.extensionQuickFixes = new Promise((r) => quickFixExtensionPoint.setHandler(fixes => {
			r(fixes.filter(c => isProposedApiEnabled(c.description, 'terminalQuickFixProvider')).map(c => {
				if (!c.value) {
					return [];
				}
				return c.value.map(fix => { return { ...fix, extensionIdentifier: c.description.identifier.value }; });
			}).flat());
		}));
		this.extensionQuickFixes.then(selectors => {
			for (const selector of selectors) {
				this.registerCommandSelector(selector);
			}
		});
	}

	registerCommandSelector(selector: ITerminalCommandSelector): void {
		this._selectors.set(selector.id, selector);
		this._onDidRegisterCommandSelector.fire(selector);
	}

	registerQuickFixProvider(id: string, provider: ITerminalQuickFixProvider): IDisposable {
		// This is more complicated than it looks like it should be because we need to return an
		// IDisposable synchronously but we must await ITerminalContributionService.quickFixes
		// asynchronously before actually registering the provider.
		let disposed = false;
		this.extensionQuickFixes.then(() => {
			if (disposed) {
				return;
			}
			this._providers.set(id, provider);
			const selector = this._selectors.get(id);
			if (!selector) {
				throw new Error(`No registered selector for ID: ${id}`);
			}
			this._onDidRegisterProvider.fire({ selector, provider });
		});
		return toDisposable(() => {
			disposed = true;
			this._providers.delete(id);
			const selector = this._selectors.get(id);
			if (selector) {
				this._selectors.delete(id);
				this._onDidUnregisterProvider.fire(selector.id);
			}
		});
	}
}

const quickFixExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ITerminalCommandSelector[]>({
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
				},
				kind: {
					description: localize('vscode.extension.contributes.terminalQuickFixes.kind', "The kind of the resulting quick fix. This changes how the quick fix is presented. Defaults to {0}.", '`"fix"`'),
					enum: ['default', 'explain'],
					enumDescriptions: [
						'A high confidence quick fix.',
						'An explanation of the problem.'
					]
				}
			},
		}
	},
});
