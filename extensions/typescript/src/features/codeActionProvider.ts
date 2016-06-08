/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {CodeActionProvider, TextDocument, Range, Command, CodeActionContext, CancellationToken, workspace} from 'vscode';
import * as vscode from 'vscode';

import {ScriptTarget} from 'typescript';
import {readFileSync} from 'fs';
import * as ts from 'typescript';
import * as quickFixRegistry from './lang/fixmyts/quickFixRegistry';
import * as quickfix from './lang/fixmyts/quickFix';
import * as utils from './lang/utils';
import { ITypescriptServiceClient } from '../typescriptService';

export default class TypeScriptCodeActionProvider implements CodeActionProvider {
	private client: ITypescriptServiceClient;

	public constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	private getScriptTarget(target: string, isJS: boolean): ts.ScriptTarget {
		const keys = Object.keys(ScriptTarget);
		let result: ts.ScriptTarget = isJS ? ts.ScriptTarget.ES5 : ts.ScriptTarget.ES3;
		if (target) {
			target = target.toLowerCase();
			for (const key of keys) {
				let value = ScriptTarget[key];
				if (key.toLowerCase() === target) {
					result = value;
				}
			}
		}
		return result;
	}

	private loadConfig(isJS: boolean) {
		var fileName = isJS ? 'jsconfig.json' : 'tsconfig.json';
		var config = ts.readConfigFile(fileName, (path) => {
			let fullPath = workspace.rootPath + '/' + path;
			return readFileSync(fullPath, 'UTF-8');
		});
		return config;
	}

	private mapDiagnostic(sourceFile: ts.SourceFile, item: vscode.Diagnostic): ts.Diagnostic {
		let mappedDiagnostic: ts.Diagnostic = {
			file: sourceFile,
			start: item.range.start.character,
			length: item.range.end.character - item.range.end.character,
			messageText: item.message,
			category: this.toCategory(item.severity),
			code: parseInt(item.code + '')
		};
		return mappedDiagnostic;
	}

	private toCategory(severity: vscode.DiagnosticSeverity): ts.DiagnosticCategory {
		var result;
		if (severity === 0) {
			result = 1;
		} else if (severity === 1) {
			result = 0;
		} else {
			result = 2;
		}
		return result;
	}

	public provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext, token: CancellationToken): Thenable<Command[]> {
		return new Promise<Command[]>((resolve, reject) => {

			return this.client.execute('projectInfo', { file: document.fileName, needFileNameList: true }).then(res => {
				let fileNames = res.body.fileNames;


				var target = ts.ScriptTarget.ES3;
				var isJS = false;

				if (document.fileName && document.fileName.length > 3) {
					var extension = document.fileName.substr(document.fileName.length - 3);
					isJS = extension && extension.toLowerCase() === '.js';
				}

				var projectConfig: any = this.loadConfig(isJS);
				if (projectConfig.config && projectConfig.config.compilerOptions) {
					target = this.getScriptTarget(projectConfig.config.compilerOptions.target, isJS);
				}

				var text = document.getText();
				var sourceFile: ts.SourceFile = ts.createSourceFile(document.fileName, text, target, true);
				var program: ts.Program = ts.createProgram(fileNames, projectConfig.config.compilerOptions);

				var possibleCommands: Command[] = [];
				var diagnosticMapped: ts.Diagnostic[] = context.diagnostics.map((item) => this.mapDiagnostic(sourceFile, item));
				var diagnosticMappedMessages: string[] = diagnosticMapped.map(item => item.messageText + '');


				quickFixRegistry.allQuickFixes.forEach(possibleQuickfix => {

					context.diagnostics.forEach(diagnostic => {
						var param: quickfix.QuickFixQueryInformation = {
							program: program,
							typeChecker: program.getTypeChecker(),
							sourceFile: sourceFile,
							sourceFileText: text,
							positionErrors: diagnosticMapped,
							positionErrorMessages: diagnosticMappedMessages,
							positionNode: utils.getTokenAtPosition(sourceFile, sourceFile.getPositionOfLineAndCharacter(diagnostic.range.start.line, diagnostic.range.start.character)),
							position: diagnostic.range,
							document: document,
							filePath: document.fileName,
							oneOfPositionNodesOfType: function (kind: ts.SyntaxKind) {
								return false;
							}

						};
						try {

							var canProvideFix: quickfix.CanProvideFixResponse = possibleQuickfix.canProvideFix(param);
							if (canProvideFix && canProvideFix.display) {
								possibleCommands.push({
									title: canProvideFix.display,
									command: 'typescript.quickfix',
									arguments: [possibleQuickfix, param]
								});
							}
						} catch (error) { }
					});
				});
				resolve(possibleCommands);
			});
		});
	}
}
