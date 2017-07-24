/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();
import { ExtensionContext, workspace, window, Disposable, commands, Uri } from 'vscode';
import { findGit, Git, IGit } from './git';
import { Model, Resource } from './model';
import { GitSCMProvider } from './scmProvider';
import { CommandCenter } from './commands';
import { StatusBarCommands } from './statusbar';
import { GitContentProvider } from './contentProvider';
import { AutoFetcher } from './autofetch';
import { Askpass } from './askpass';
import { toDisposable } from './util';
import TelemetryReporter from 'vscode-extension-telemetry';

let commandCenter : CommandCenter;
async function init(context: ExtensionContext, disposables: Disposable[]): Promise<Model | undefined> {
	const { name, version, aiKey } = require(context.asAbsolutePath('./package.json')) as { name: string, version: string, aiKey: string };
	const telemetryReporter: TelemetryReporter = new TelemetryReporter(name, version, aiKey);
	disposables.push(telemetryReporter);

	const outputChannel = window.createOutputChannel('Git');
	disposables.push(outputChannel);

	const config = workspace.getConfiguration('git');
	const enabled = config.get<boolean>('enabled') === true;
	const workspaceRootPath = workspace.rootPath;

	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint);
	const askpass = new Askpass();
	const env = await askpass.getEnv();
	const git = new Git({ gitPath: info.path, version: info.version, env });

	if (!workspaceRootPath || !enabled) {
		commandCenter = new CommandCenter(git, undefined, outputChannel, telemetryReporter);
		disposables.push(commandCenter);
		return;
	}

	const model = new Model(git, workspaceRootPath);

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));

	const onOutput = str => outputChannel.append(str);
	git.onOutput.addListener('log', onOutput);
	disposables.push(toDisposable(() => git.onOutput.removeListener('log', onOutput)));

	commandCenter = new CommandCenter(git, model, outputChannel, telemetryReporter);
	const statusBarCommands = new StatusBarCommands(model);
	const provider = new GitSCMProvider(model, commandCenter, statusBarCommands);
	const contentProvider = new GitContentProvider(model);
	const autoFetcher = new AutoFetcher(model);

	disposables.push(
		commandCenter,
		provider,
		contentProvider,
		autoFetcher,
		model
	);

	await checkGitVersion(info);
	return model;
}

export function activate(context: ExtensionContext): any {
	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));
	let api = {
		getResources() : Resource[] | undefined {
			return undefined;
		},
		commitStaged(commitMessage? : string) {
			commandCenter.commitStagedWithMessage(commitMessage);
		},
		push() {
			commandCenter.push();
		}
	};

	init(context, disposables)
		.then((model) => {
			api.getResources = function() {
				return model ? model.indexGroup.resources : undefined;
			}
		})
		.catch(err => console.error(err));
	return api;
}

async function checkGitVersion(info: IGit): Promise<void> {
	const config = workspace.getConfiguration('git');
	const shouldIgnore = config.get<boolean>('ignoreLegacyWarning') === true;

	if (shouldIgnore) {
		return;
	}

	if (!/^[01]/.test(info.version)) {
		return;
	}

	const update = localize('updateGit', "Update Git");
	const neverShowAgain = localize('neverShowAgain', "Don't show again");

	const choice = await window.showWarningMessage(
		localize('git20', "You seem to have git {0} installed. Code works best with git >= 2", info.version),
		update,
		neverShowAgain
	);

	if (choice === update) {
		commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
	} else if (choice === neverShowAgain) {
		await config.update('ignoreLegacyWarning', true, true);
	}
}