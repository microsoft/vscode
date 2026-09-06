/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { mapFindFirst } from '../../../util/vs/base/common/arraysFind';
import { assertNever } from '../../../util/vs/base/common/assert';
import { timeout } from '../../../util/vs/base/common/async';
import { ChatResponseConfirmationPart, ChatResponseExtensionsPart, ChatResponseMarkdownPart, ExtensionMode, MarkdownString } from '../../../vscodeTypes';
import { IRunCommandExecutionService } from '../../commands/common/runCommandExecutionService';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { TextDocumentSnapshot } from '../../editing/common/textDocumentSnapshot';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IExtensionsService } from '../../extensions/common/extensionsService';
import { IPackageJson } from '../../extensions/common/packageJson';
import { ISetupTestExtension, testExtensionsForLanguage } from '../common/setupTestExtensions';
import { ITestProvider } from '../common/testProvider';
import { ITestDepsResolver } from './testDepsResolver';

interface IDocumentContext {
	readonly document: TextDocumentSnapshot;
	readonly wholeRange: vscode.Range;
	readonly selection: vscode.Selection;
}

export interface ISetupTestsDetector {
	_serviceBrand: undefined;

	/**
	 * Gets whether copilot should first offer to set up tests.
	 * @returns The setup test action to take, if any
	 */
	shouldSuggestSetup(context: IDocumentContext, request: vscode.ChatRequest, output: vscode.ChatResponseStream): Promise<SetupTestAction | undefined>;

	/**
	 * Returns th chat response parts suggested by the setup test action.
	 */
	showSuggestion(action: SetupTestAction): vscode.ExtendedChatResponsePart[];
}

export type SetupConfirmationResult = { message: string; command?: vscode.Command };

export const ISetupTestsDetector = createServiceIdentifier<ISetupTestsDetector>('ISetupTestsDetector');

export const enum SetupTestActionType {
	InstallExtensionForLanguage,
	InstallExtensionForFramework,
	SearchForFramework,
	SearchGeneric,
	/** Show a reminder at the end of the /tests generation that they can use `/setupTests */
	Remind,
	/** A confirmed action was handled internally. */
	WasHandled,
	/** Command from the extension's contributed handler */
	CustomExtensionCommand,
}

export type SetupTestAction =
	| { type: SetupTestActionType.InstallExtensionForLanguage; language: string; extension: ISetupTestExtension }
	| { type: SetupTestActionType.InstallExtensionForFramework; framework: string; extension: ISetupTestExtension }
	| { type: SetupTestActionType.SearchForFramework; framework: string }
	| { type: SetupTestActionType.SearchGeneric; context: TextDocumentSnapshot }
	| { type: SetupTestActionType.Remind; action: SetupTestAction }
	| { type: SetupTestActionType.WasHandled }
	| { type: SetupTestActionType.CustomExtensionCommand; message: string; command?: vscode.Command };

const DID_ALREADY_PROMPT = 'testing.setup.skipForWorkspace';

export class NullSetupTestsDetector implements ISetupTestsDetector {
	declare _serviceBrand: undefined;
	shouldSuggestSetup() {
		return Promise.resolve(undefined);
	}
	showSuggestion() {
		return [];
	}
	handleInvocation(): Promise<boolean> {
		return Promise.resolve(false);
	}
}

const enum CommandIds {
	InstallExtension = 'workbench.extensions.installExtension',
	ShowExtensionsWithIds = 'workbench.extensions.action.showExtensionsWithIds',
	SearchExtensions = 'workbench.extensions.search',
	OpenChat = 'workbench.action.chat.open'
}

export const isStartSetupTestConfirmation = (confirmationData: any) =>
	confirmationData && confirmationData.$isSetupSuggestion && confirmationData.command === CommandIds.OpenChat;

export class SetupTestsDetector implements ISetupTestsDetector {
	declare _serviceBrand: undefined;

	private _didAlreadyPrompt?: boolean;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITestDepsResolver private readonly _testDepsResolver: ITestDepsResolver,
		@ITestProvider private readonly _testService: ITestProvider,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IExtensionsService private readonly _extensionsService: IExtensionsService,
		@IRunCommandExecutionService private readonly _commandService: IRunCommandExecutionService,
	) { }

	/** @inheritdoc */
	public showSuggestion(action: SetupTestAction): vscode.ExtendedChatResponsePart[] {
		this.setDidAlreadyPrompt();

		const output: vscode.ExtendedChatResponsePart[] = [];
		const frameworkQuery = (framework: string) => `@category:testing ${framework}`;

		switch (action.type) {
			case SetupTestActionType.InstallExtensionForFramework:
			case SetupTestActionType.InstallExtensionForLanguage:
				output.push(new ChatResponseConfirmationPart(
					l10n.t('We recommend installing an extension to run {0} tests.', action.type === SetupTestActionType.InstallExtensionForFramework ? action.framework : action.language),
					l10n.t('Install {0} (`{1}`)?', action.extension.name, action.extension.id),
					{
						$isSetupSuggestion: true,
						command: CommandIds.InstallExtension,
						arguments: [action.extension.id, { enable: true }]
					}
				));
				break;
			case SetupTestActionType.SearchForFramework:
				output.push(new ChatResponseConfirmationPart(
					l10n.t('We recommend installing an extension to run {0} tests.', action.framework),
					l10n.t('Would you like to search for one now?'),
					{
						$isSetupSuggestion: true,
						command: CommandIds.SearchExtensions,
						arguments: [frameworkQuery(action.framework)]
					}
				));
				break;
			case SetupTestActionType.SearchGeneric:
				output.push(new ChatResponseConfirmationPart(
					l10n.t('It looks like you may not have tests set up in this repository yet.'),
					l10n.t('Would you like to set them up?'),
					{
						$isSetupSuggestion: true,
						command: CommandIds.OpenChat,
						arguments: [{ query: `/setupTests` }],
					}
				));
				break;
			case SetupTestActionType.CustomExtensionCommand:
				if (action.command) {
					output.push(new ChatResponseConfirmationPart(
						action.command.title,
						action.message,
						{
							$isSetupSuggestion: true,
							command: action.command.command,
							arguments: action.command.arguments,
						}
					));
				} else {
					output.push(new ChatResponseMarkdownPart(action.message));
				}
				break;

			case SetupTestActionType.Remind: {
				// show the suggestion inline in a mardown parm without separate buttons:
				const action2 = action.action;
				switch (action2.type) {
					case SetupTestActionType.InstallExtensionForFramework:
					case SetupTestActionType.InstallExtensionForLanguage: {
						const s = new MarkdownString(l10n.t(
							'We recommend installing the {0} extension to run {1} tests.',
							action2.extension.name,
							action2.type === SetupTestActionType.InstallExtensionForFramework ? action2.framework : action2.language
						));
						s.appendMarkdown('\n\n');
						output.push(new ChatResponseMarkdownPart(s));
						output.push(new ChatResponseExtensionsPart([action2.extension.id]));
						break;
					}
					case SetupTestActionType.SearchForFramework: {
						const s = new MarkdownString(l10n.t(
							'We recommend [installing an extension]({0}) to run {1} tests.',
							commandUri('workbench.extensions.search', [frameworkQuery(action2.framework)]),
							action2.framework,
						));
						s.isTrusted = { enabledCommands: ['workbench.extensions.search'] };
						output.push(new ChatResponseMarkdownPart(s));
						break;
					}
				}
				break;
			}
			case SetupTestActionType.WasHandled:
				break;
			default:
				assertNever(action);
		}

		return output;
	}

	/**
	 * @inheritdoc
	 *
	 * See `src/platform/testing/node/setupTestDetector.png` for the flow followed here.
	 */
	public async shouldSuggestSetup({ document }: IDocumentContext, request: vscode.ChatRequest, output: vscode.ChatResponseStream): Promise<SetupTestAction | undefined> {
		if (request.rejectedConfirmationData?.some(r => r.$isSetupSuggestion)) {
			return undefined; // said "not now" to setup
		}

		const confirmed = request.acceptedConfirmationData?.find(r => r.$isSetupSuggestion);
		if (confirmed) {
			const exe = this._commandService.executeCommand(confirmed.command, ...confirmed.arguments);

			// Most commands search, but if they're installing an extension, show
			// nice progress and then generate the tests as requested.
			if (confirmed.command === CommandIds.InstallExtension) {
				output.progress(l10n.t(`Installing extension {0}...`, confirmed.arguments[0]));
				await this.waitForExtensionInstall(exe, document, confirmed.arguments[0]);
				return undefined;
			}

			return { type: SetupTestActionType.WasHandled };
		}

		if (!this._configurationService.getConfig(ConfigKey.SetupTests) || await this._testService.hasAnyTests()) {
			return undefined;
		}

		const action = await this.getSuggestActionInner(document);
		if (action && this.getDidAlreadyPrompt()) {
			return { type: SetupTestActionType.Remind, action };
		}

		return action;
	}

	private async waitForExtensionInstall(prom: Promise<void>, document: TextDocumentSnapshot, extensionId: string) {
		await prom;

		let extension: vscode.Extension<any> | undefined;
		do {
			extension = this._extensionsService.getExtension(extensionId);
			await timeout(100);
		} while (!extension);

		const testSection = (extension.packageJSON as IPackageJson)?.copilot?.tests;
		const command = testSection?.setupTests || testSection?.getSetupConfirmation;
		return command ? await this.getDelegatedAction(command, document) : undefined;
	}

	private getDidAlreadyPrompt() {
		if (this._extensionContext.extensionMode === ExtensionMode.Development) {
			return !!this._didAlreadyPrompt;
		} else {
			return this._extensionContext.workspaceState.get(DID_ALREADY_PROMPT, false);
		}
	}

	private setDidAlreadyPrompt() {
		if (this._extensionContext.extensionMode === ExtensionMode.Development) {
			this._didAlreadyPrompt = true;
		} else {
			this._extensionContext.workspaceState.update(DID_ALREADY_PROMPT, true);
		}
	}

	private async getDelegatedAction(command: string, doc: TextDocumentSnapshot): Promise<SetupTestAction | undefined> {
		try {
			const result: SetupConfirmationResult | undefined = await this._commandService.executeCommand(command, doc.uri);
			if (result) {
				return { type: SetupTestActionType.CustomExtensionCommand, command: result.command, message: result.message };
			}
		} catch (e) {
			// ignore
		}
	}

	private async getExtensionRecommendationAndDelegate(extensionInfo: ISetupTestExtension, doc: TextDocumentSnapshot, ifNotInstalledThen: SetupTestAction): Promise<SetupTestAction | undefined> {
		const extension = this._extensionsService.getExtension(extensionInfo.id);
		if (!extension) {
			return ifNotInstalledThen;
		}

		const command = (extension.packageJSON as IPackageJson)?.copilot?.tests?.getSetupConfirmation;
		return command ? await this.getDelegatedAction(command, doc) : undefined;
	}

	private async getSuggestActionInner(doc: TextDocumentSnapshot): Promise<SetupTestAction | undefined> {
		const knownByLanguage = testExtensionsForLanguage.get(doc.languageId);
		const languageExt = knownByLanguage?.forLanguage?.extension;
		if (languageExt) {
			return this.getExtensionRecommendationAndDelegate(languageExt, doc, { type: SetupTestActionType.InstallExtensionForLanguage, language: doc.languageId, extension: languageExt });
		}

		if (!knownByLanguage?.perFramework) {
			return { type: SetupTestActionType.SearchGeneric, context: doc };
		}

		const frameworks = await this._testDepsResolver.getTestDeps(doc.languageId);
		const knownByFramework = mapFindFirst(frameworks, f => {
			const found = knownByLanguage.perFramework!.get(f);
			return found && { extension: found, framework: f };
		});
		if (knownByFramework) {
			return this.getExtensionRecommendationAndDelegate(knownByFramework.extension, doc, { type: SetupTestActionType.InstallExtensionForFramework, ...knownByFramework });
		}

		if (frameworks.length) {
			return { type: SetupTestActionType.SearchForFramework, framework: frameworks[0] };
		}

		return { type: SetupTestActionType.SearchGeneric, context: doc };
	}
}

function commandUri(command: string, args: readonly any[]): string {
	return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}
