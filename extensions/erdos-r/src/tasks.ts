/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as os from 'os';
import { RSessionManager } from './session-manager';
import { getEnvVars } from './session';
import { prepCliEnvVars } from './uri-handler';

export class RPackageTaskProvider implements vscode.TaskProvider {

	async provideTasks() {
		const tasks = getRPackageTasks();
		return tasks;
	}

	resolveTask(_task: vscode.Task): vscode.Task | undefined {
		return undefined;
	}

}

export async function providePackageTasks(context: vscode.ExtensionContext): Promise<void> {
	context.subscriptions.push(
		vscode.tasks.registerTaskProvider('rPackageTask', new RPackageTaskProvider())
	);
}

export async function getRPackageTasks(editorFilePath?: string): Promise<vscode.Task[]> {
	if (!RSessionManager.instance.hasLastBinpath()) {
		throw new Error(`No running R runtime to use for R package tasks.`);
	}
	const binpath = RSessionManager.instance.getLastBinpath();
	const taskData = [
		{
			task: 'r.task.packageCheck',
			message: vscode.l10n.t('{taskName}', { taskName: 'Check R package' }),
			rcode: 'devtools::check()',
			package: 'devtools',
			envVars: { ... await prepCliEnvVars() }
		},
		{
			task: 'r.task.packageInstall',
			message: vscode.l10n.t('{taskName}', { taskName: 'Install R package' }),
			rcode: 'pak::local_install(upgrade = FALSE)',
			package: 'pak',
			envVars: null
		},
		{
			task: 'r.task.packageTest',
			message: vscode.l10n.t('{taskName}', { taskName: 'Test R package' }),
			rcode: 'devtools::test()',
			package: 'devtools',
			envVars: {
				... await getEnvVars(['TESTTHAT_MAX_FAILS']),
				... await prepCliEnvVars()
			}
		},
		{
			task: 'r.task.rmarkdownRender',
			message: vscode.l10n.t('{taskName}', { taskName: 'Render document with R Markdown' }),
			rcode: `rmarkdown::render("${editorFilePath}")`,
			package: 'rmarkdown',
			envVars: null
		}
	];

	return taskData.map(data => {
		let taskEnv = {};

		if (data.envVars) {
			Object.assign(taskEnv, data.envVars);
		}

		let exec: vscode.ProcessExecution | vscode.ShellExecution;
		if (data.task === 'r.task.rmarkdownRender' && os.platform() === 'win32') {
			exec = new vscode.ProcessExecution(
				binpath,
				['--quiet', '--no-restore', '--no-save', '-e', data.rcode],
				{ env: taskEnv }
			);
		} else {
			exec = new vscode.ShellExecution(
				binpath,
				['--quiet', '--no-restore', '--no-save', '-e', { value: data.rcode, quoting: vscode.ShellQuoting.Strong }],
				{ env: taskEnv }
			);
		}

		return new vscode.Task(
			{ type: 'rPackageTask', task: data.task, pkg: data.package },
			vscode.TaskScope.Workspace,
			data.message,
			'R',
			exec,
			[]
		);
	});
}
