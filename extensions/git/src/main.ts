/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();
import { ExtensionContext, workspace, window, Disposable, commands, Uri, OutputChannel } from 'vscode';
import { findGit, Git, IGit } from './git';
import { Model } from './model';
import { CommandCenter } from './commands';
import { GitContentProvider } from './contentProvider';
import { GitDecorations } from './decorationProvider';
import { Askpass } from './askpass';
import { toDisposable, filterEvent, eventToPromise } from './util';
import TelemetryReporter from 'vscode-extension-telemetry';
import { API, createApi } from './api';

let telemetryReporter: TelemetryReporter;

async function init(context: ExtensionContext, outputChannel: OutputChannel, disposables: Disposable[]): Promise<Model> {
	const pathHint = workspace.getConfiguration('git').get<string>('path');
	const info = await findGit(pathHint, path => outputChannel.appendLine(localize('looking', "Looking for git in: {0}", path)));
	const askpass = new Askpass();
	const env = await askpass.getEnv();
	const git = new Git({ gitPath: info.path, version: info.version, env });
	const model = new Model(git, context.globalState, outputChannel);
	disposables.push(model);

	const onRepository = () => commands.executeCommand('setContext', 'gitOpenRepositoryCount', `${model.repositories.length}`);
	model.onDidOpenRepository(onRepository, null, disposables);
	model.onDidCloseRepository(onRepository, null, disposables);
	onRepository();

	outputChannel.appendLine(localize('using git', "Using git {0} from {1}", info.version, info.path));

	const onOutput = (str: string) => {
		const lines = str.split(/\r?\n/mg);

		while (/^\s*$/.test(lines[lines.length - 1])) {
			lines.pop();
		}

		outputChannel.appendLine(lines.join('\n'));
	};
	git.onOutput.addListener('log', onOutput);
	disposables.push(toDisposable(() => git.onOutput.removeListener('log', onOutput)));

	disposables.push(
		new CommandCenter(git, model, outputChannel, telemetryReporter),
		new GitContentProvider(model),
		new GitDecorations(model)
	);

	await checkGitVersion(info);

	return model;
}

async function _activate(context: ExtensionContext, disposables: Disposable[]): Promise<Model | undefined> {
	const outputChannel = window.createOutputChannel('Git');
	commands.registerCommand('git.showOutput', () => outputChannel.show());
	disposables.push(outputChannel);

	try {
		return await init(context, outputChannel, disposables);
	} catch (err) {
		if (!/Git installation not found/.test(err.message || '')) {
			throw err;
		}

		const config = workspace.getConfiguration('git');
		const shouldIgnore = config.get<boolean>('ignoreMissingGitWarning') === true;

		if (shouldIgnore) {
			return;
		}

		console.warn(err.message);
		outputChannel.appendLine(err.message);
		outputChannel.show();

		const download = localize('downloadgit', "Download Git");
		const neverShowAgain = localize('neverShowAgain', "Don't Show Again");
		const choice = await window.showWarningMessage(
			localize('notfound', "Git not found. Install it or configure it using the 'git.path' setting."),
			download,
			neverShowAgain
		);

		if (choice === download) {
			commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/'));
		} else if (choice === neverShowAgain) {
			await config.update('ignoreMissingGitWarning', true, true);
		}
	}
}

export function activate(context: ExtensionContext): API {
	const config = workspace.getConfiguration('git', null);
	const enabled = config.get<boolean>('enabled');

	const disposables: Disposable[] = [];
	context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));

	const { name, version, aiKey } = require(context.asAbsolutePath('./package.json')) as { name: string, version: string, aiKey: string };
	telemetryReporter = new TelemetryReporter(name, version, aiKey);

	let activatePromise: Promise<Model | undefined>;

	if (enabled) {
		activatePromise = _activate(context, disposables);
	} else {
		const onConfigChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git'));
		const onEnabled = filterEvent(onConfigChange, () => workspace.getConfiguration('git', null).get<boolean>('enabled') === true);

		activatePromise = eventToPromise(onEnabled)
			.then(() => _activate(context, disposables));
	}

	const modelPromise = activatePromise
		.then(model => model || Promise.reject<Model>('Git model not found'));

	activatePromise.catch(err => console.error(err));

	return createApi(modelPromise);
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
	const neverShowAgain = localize('neverShowAgain', "Don't Show Again");

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

export function deactivate(): Promise<any> {
	return telemetryReporter ? telemetryReporter.dispose() : Promise.resolve(null);
}
