/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as erdos from 'erdos';
import { generateDirectInjectionId, PromiseHandles } from './util';
import { checkInstalled } from './session';
import { getRPackageName } from './contexts';
import { getRPackageTasks } from './tasks';
import { RSessionManager } from './session-manager';
import { quickPickRuntime } from './runtime-quickpick';
import { MINIMUM_RENV_VERSION, MINIMUM_R_VERSION } from './constants';
import { RRuntimeManager } from './runtime-manager';
import { RMetadataExtra } from './r-installation';
import { LOGGER } from './extension.js';
import { printInterpreterSettingsInfo } from './interpreter-settings.js';

export async function registerCommands(context: vscode.ExtensionContext, runtimeManager: RRuntimeManager) {

	context.subscriptions.push(

		vscode.commands.registerCommand('r.createNewFile', () => {
			vscode.workspace.openTextDocument({ language: 'r' }).then((newFile) => {
				vscode.window.showTextDocument(newFile);
			});
		}),

		vscode.commands.registerCommand('r.insertPipe', () => {
			const extConfig = vscode.workspace.getConfiguration('erdos.r');
			const pipeString = extConfig.get<string>('pipe') || '|>';
			insertOperatorWithSpace(pipeString);
		}),

		vscode.commands.registerCommand('r.insertSection', () => {
			insertSection();
		}),

		vscode.commands.registerCommand('r.insertPipeConsole', () => {
			const extConfig = vscode.workspace.getConfiguration('erdos.r');
			const pipeString = extConfig.get<string>('pipe') || '|>';
			vscode.commands.executeCommand('default:type', { text: ` ${pipeString} ` });
		}),

		vscode.commands.registerCommand('r.insertLeftAssignment', () => {
			insertOperatorWithSpace('<-');
		}),

		vscode.commands.registerCommand('r.insertLeftAssignmentConsole', () => {
			vscode.commands.executeCommand('default:type', { text: ' <- ' });
		}),

		vscode.commands.registerCommand('r.packageLoad', async () => {
			executeCodeForCommand('devtools', 'devtools::load_all()');
		}),

		vscode.commands.registerCommand('r.packageBuild', async () => {
			executeCodeForCommand('devtools', 'devtools::build()');
		}),

		vscode.commands.registerCommand('r.packageInstall', async () => {
			const packageName = await getRPackageName();
			const tasks = await getRPackageTasks();
			const task = tasks.filter(task => task.definition.task === 'r.task.packageInstall')[0];
			const isInstalled = await checkInstalled(task.definition.pkg);
			if (!isInstalled) {
				return;
			}
			const session = RSessionManager.instance.getConsoleSession();
			if (!session) {
				return;
			}

			const execution = await vscode.tasks.executeTask(task);
			const disp1 = vscode.tasks.onDidEndTaskProcess(async e => {
				if (e.execution === execution) {
					if (e.exitCode === 0) {
						vscode.commands.executeCommand('workbench.panel.erdosConsole.focus');

						const promise = new PromiseHandles<void>();
						const disp2 = session.onDidChangeRuntimeState(runtimeState => {
							if (runtimeState === erdos.RuntimeState.Ready) {
								promise.resolve();
								disp2.dispose();
							}
						});

						try {
							await erdos.runtime.restartSession(session.metadata.sessionId);
						} catch (err) {
							disp1.dispose();
							disp2.dispose();
							promise.reject(err);
							vscode.window.showErrorMessage(vscode.l10n.t('Failed to restart R after installing R package: {0}', JSON.stringify(err)));
							return;
						}

						session.execute(`library(${packageName})`,
							generateDirectInjectionId(),
							erdos.RuntimeCodeExecutionMode.Interactive,
							erdos.RuntimeErrorBehavior.Continue);
					}
					disp1.dispose();
				}
			});
		}),

		vscode.commands.registerCommand('r.packageTest', async () => {
			const tasks = await getRPackageTasks();
			const task = tasks.filter(task => task.definition.task === 'r.task.packageTest')[0];
			const isInstalled = await checkInstalled(task.definition.pkg);
			if (isInstalled) {
				vscode.tasks.executeTask(task);
			}
		}),

		vscode.commands.registerCommand('r.packageCheck', async () => {
			const tasks = await getRPackageTasks();
			const task = tasks.filter(task => task.definition.task === 'r.task.packageCheck')[0];
			const isInstalled = await checkInstalled(task.definition.pkg);
			if (isInstalled) {
				vscode.tasks.executeTask(task);
			}
		}),

		vscode.commands.registerCommand('r.packageDocument', async () => {
			executeCodeForCommand('devtools', 'devtools::document()');
		}),

		vscode.commands.registerCommand('r.selectInterpreter', async () => {
			await quickPickRuntime(runtimeManager);
		}),

		vscode.commands.registerCommand('r.scriptPath', async () => {
			const session = RSessionManager.instance.getConsoleSession();
			if (!session) {
				throw new Error(`Cannot get Rscript path; no R session available`);
			}
			const scriptPath = (session.runtimeMetadata.extraRuntimeData as RMetadataExtra).scriptpath;
			if (!scriptPath) {
				throw new Error(`Cannot get Rscript path; no Rscript path available`);
			}
			return scriptPath;
		}),

		vscode.commands.registerCommand('r.sourceCurrentFile', async () => {
			sourceCurrentFile(false);
		}),
		vscode.commands.registerCommand('r.sourceCurrentFileWithEcho', async () => {
			sourceCurrentFile(true);
		}),

		vscode.commands.registerCommand('r.rmarkdownRender', async () => {
			const filePath = await getEditorFilePathForCommand();
			if (filePath) {
				const tasks = await getRPackageTasks(filePath);
				const task = tasks.filter(task => task.definition.task === 'r.task.rmarkdownRender')[0];
				const isInstalled = await checkInstalled(task.definition.pkg);
				if (isInstalled) {
					try {
						vscode.tasks.executeTask(task);
					} catch (e) {
					}
				}
			}
		}),

		vscode.commands.registerCommand('r.getMinimumRVersion', (): string => MINIMUM_R_VERSION),

		vscode.commands.registerCommand('r.renvInit', async () => {
			const isInstalled = await checkInstalled('renv', MINIMUM_RENV_VERSION);
			if (isInstalled) {
				const session = await erdos.runtime.getForegroundSession();
				if (session) {
					session.execute(`renv::init()`, generateDirectInjectionId(), erdos.RuntimeCodeExecutionMode.Interactive, erdos.RuntimeErrorBehavior.Continue);
				} else {
					console.debug('[r.renvInit] no session available');
				}
			} else {
				console.debug('[r.renvInit] renv is not installed');
			}
		}),

		vscode.commands.registerCommand('r.interpreters.settingsInfo', async () => {
			LOGGER.show();
			printInterpreterSettingsInfo();
		}),

		vscode.commands.registerCommand('r.suggestHelpTopics', async (query: string): Promise<string[]> => {
			const result = await suggestRHelpTopics(query || '');
			return result;
		}),

		vscode.commands.registerCommand('r.getHelpAsMarkdown', async (topic: string, packageName?: string): Promise<string> => {
			return await getHelpAsMarkdown(topic, packageName || '');
		}),
	);
}

function insertOperatorWithSpace(op: string) {
	if (!vscode.window.activeTextEditor) {
		return;
	}
	const editor = vscode.window.activeTextEditor;
	editor.selections = editor.selections.map(s => new vscode.Selection(s.start, s.end));

	return editor.edit(editBuilder => {
		editor.selections.forEach(sel => {
			const startPos = sel.start;
			const endPos = sel.end;
			const lineText = editor.document.lineAt(startPos).text;
			let insertValue = op;

			const precedingChar = lineText.charAt(startPos.character - 1);
			if (!/\s/g.test(precedingChar)) {
				insertValue = ' ' + insertValue;
			}

			const followingChar = lineText.charAt(endPos.character);
			if (!/\s/g.test(followingChar)) {
				insertValue = insertValue + ' ';
			}

			editBuilder.replace(sel, insertValue);
		});
	});
}

function insertSection() {
	vscode.window.showInputBox({
		placeHolder: vscode.l10n.t('Section label'),
		prompt: vscode.l10n.t('Enter the name of the section to insert'),
	}).then((sectionName) => {
		if (sectionName) {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}

			const config = vscode.workspace.getConfiguration('editor');
			const rulers = config.get<Array<number>>('rulers');
			const targetWidth = rulers && rulers.length > 0 ? rulers[0] - 5 : 75;

			const selection = editor.selection;
			const text = editor.document.getText(selection);

			let section = '\n# ' + sectionName + ' ';

			if (targetWidth - section.length < 4) {
				section += '----';
			} else {
				for (let i = section.length; i < targetWidth; i++) {
					section += '-';
				}
			}
			section += '\n\n';

			editor.edit((editBuilder) => {
				editBuilder.replace(selection, text + section);
			});
		}
	});
}

async function executeCodeForCommand(pkg: string, code: string) {
	const isInstalled = await checkInstalled(pkg);
	if (isInstalled) {
		erdos.runtime.executeCode(
			'r',
			code,
			true,
			true,
			erdos.RuntimeCodeExecutionMode.NonInteractive
		);
	}
}

export async function getEditorFilePathForCommand() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}

	const filePath = editor.document.uri.fsPath;
	if (!filePath) {
		vscode.window.showWarningMessage('Cannot save untitled file.');
		return;
	}

	await vscode.commands.executeCommand('workbench.action.files.save');

	const fsStat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));

	if (fsStat) {
		return filePath.replace(/\\/g, '/');
	}
	return;
}

async function sourceCurrentFile(echo: boolean) {
	try {
		const filePath = await getEditorFilePathForCommand();
		if (filePath) {
			let command = `source(${JSON.stringify(filePath)})`;
			if (echo) {
				command = `source(${JSON.stringify(filePath)}, echo = TRUE)`;
			}
			erdos.runtime.executeCode('r', command, false);
		}
	} catch (e) {
	}
}

export async function suggestRHelpTopics(query: string): Promise<string[]> {
	
	const manager = RSessionManager.instance;
	const session = manager.getConsoleSession();
	
	if (!session) {
		return [];
	}
	
    const topics = await session.callMethod('suggest_topics', query);
    
    if (Array.isArray(topics)) {
        const filteredTopics = topics.filter(topic => typeof topic === 'string');
        return filteredTopics;
    } else {
        return [];
    }
}

export async function getHelpAsMarkdown(topic: string, packageName: string = ''): Promise<string> {
	const manager = RSessionManager.instance;
	const session = manager.getConsoleSession();
	
	if (!session) {
		console.log('No R console session available for help content');
		return '';
	}
	
	try {
		const helpPage = await session.callMethod('get_help_page', topic, packageName);
		if (helpPage && typeof helpPage === 'object' && helpPage.help_text) {
			return helpPage.help_text;
		} else if (helpPage && typeof helpPage === 'string') {
			return helpPage;
		}
	} catch (error) {
		console.log('get_help_page method call failed:', error);
	}
	
	return '';
}
