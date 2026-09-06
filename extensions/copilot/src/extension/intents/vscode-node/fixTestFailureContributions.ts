/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITestFailure, ITestProvider } from '../../../platform/testing/common/testProvider';
import { mapFindFirst } from '../../../util/vs/base/common/arraysFind';
import { Disposable, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { Intent } from '../../common/constants';
import { IExtensionContribution } from '../../common/contributions';


export class FixTestFailureContribution extends Disposable implements IExtensionContribution {
	constructor(
		@ITestProvider testProvider: ITestProvider,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const store = this._register(new DisposableStore());
		registerTestMessageSparkles(store, telemetryService, testProvider);
		registerTestFailureCodeAction(testProvider, configurationService, store);
	}
}

type FixCommandArgs = { message: vscode.TestMessage; test: vscode.TestItem | vscode.TestResultSnapshot; source?: 'sparkles' | 'testResultsPanel' | 'retry' };

function registerTestMessageSparkles(store: DisposableStore, telemetryService: ITelemetryService, testProvider: ITestProvider) {
	function getLastFailureForItemOrChildren(item: vscode.TestItem): ITestFailure | undefined {
		const failure = testProvider.getLastFailureFor(item);
		return failure || mapFindFirst(item.children, ([, item]) => getLastFailureForItemOrChildren(item));
	}

	store.add(vscode.commands.registerCommand('github.copilot.tests.fixTestFailure.fromInline', (item: vscode.TestItem) => {
		const failure = getLastFailureForItemOrChildren(item);
		if (failure) {
			openFixChat({
				message: failure.task.messages[0],
				test: failure.snapshot,
				source: 'testResultsPanel',
			});
		}
	}));

	store.add(vscode.commands.registerCommand('github.copilot.tests.fixTestFailure', openFixChat));

	async function openFixChat(args: FixCommandArgs) {
		if (!args.test.uri) {
			return; // should not happen based on context keys
		}

		/* __GDPR__
		"intent.fixTestFailure.actioned" : {
			"owner": "connor4312",
			"comment": "Reports when we show a ",
			"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Where the action was taken" }
		}
		*/
		telemetryService.sendMSFTTelemetryEvent('intent.fixTestFailure.actioned', {
			source: args.source ?? 'testResultsPanel',
		});

		const doc = await vscode.workspace.openTextDocument(args.test.uri);
		await vscode.window.showTextDocument(doc, {
			preserveFocus: false, // must transfer focus so editor chat starts at the right place
			preview: true,
			selection: args.test.range ? new vscode.Range(args.test.range.start, args.test.range.start) : undefined
		});

		await vscode.commands.executeCommand('vscode.editorChat.start', {
			message: `/${Intent.Fix} the #testFailure`,
			autoSend: true,
		});
	}
}

function registerTestFailureCodeAction(testProvider: ITestProvider, configurationService: IConfigurationService, store: DisposableStore) {
	store.add(vscode.languages.registerCodeActionsProvider('*', {
		provideCodeActions(document, range, context, token) {
			const copilotCodeActionsEnabled = configurationService.getConfig(ConfigKey.EnableCodeActions);
			if (!copilotCodeActionsEnabled) {
				return;
			}

			const test = testProvider.getFailureAtPosition(document.uri, range.start);
			if (!test) {
				return undefined;
			}

			const ca = new vscode.CodeAction(l10n.t('Fix test failure'), vscode.CodeActionKind.QuickFix);
			ca.isAI = true;
			ca.command = {
				title: l10n.t('Fix test failure'),
				command: 'github.copilot.tests.fixTestFailure',
				arguments: [{
					message: test.task.messages[0],
					test: test.snapshot,
					source: 'sparkles',
				} satisfies FixCommandArgs]
			};
			return [ca];
		},
	}));
}

