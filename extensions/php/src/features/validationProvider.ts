/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as cp from 'child_process';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';

import * as vscode from 'vscode';

import { ThrottledDelayer } from './utils/async';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

export class LineDecoder {
	private stringDecoder: NodeStringDecoder;
	private remaining: string;

	constructor(encoding: string = 'utf8') {
		this.stringDecoder = new StringDecoder(encoding);
		this.remaining = null;
	}

	public write(buffer: NodeBuffer): string[] {
		var result: string[] = [];
		var value = this.remaining
			? this.remaining + this.stringDecoder.write(buffer)
			: this.stringDecoder.write(buffer);

		if (value.length < 1) {
			return result;
		}
		var start = 0;
		var ch: number;
		while (start < value.length && ((ch = value.charCodeAt(start)) === 13 || ch === 10)) {
			start++;
		}
		var idx = start;
		while (idx < value.length) {
			ch = value.charCodeAt(idx);
			if (ch === 13 || ch === 10) {
				result.push(value.substring(start, idx));
				idx++;
				while (idx < value.length && ((ch = value.charCodeAt(idx)) === 13 || ch === 10)) {
					idx++;
				}
				start = idx;
			} else {
				idx++;
			}
		}
		this.remaining = start < value.length ? value.substr(start) : null;
		return result;
	}

	public end(): string {
		return this.remaining;
	}
}

enum RunTrigger {
	onSave,
	onType
}

namespace RunTrigger {
	export let strings = {
		onSave: 'onSave',
		onType: 'onType'
	};
	export let from = function(value: string): RunTrigger {
		if (value === 'onType') {
			return RunTrigger.onType;
		} else {
			return RunTrigger.onSave;
		}
	};
}

export default class PHPValidationProvider {

	private static MatchExpression: RegExp = /(?:(?:Parse|Fatal) error): (.*)(?: in )(.*?)(?: on line )(\d+)/;
	private static BufferArgs: string[] = ['-l', '-n', '-d', 'display_errors=On', '-d', 'log_errors=Off'];
	private static FileArgs: string[] = ['-l', '-n', '-d', 'display_errors=On', '-d', 'log_errors=Off', '-f'];

	private validationEnabled: boolean;
	private executable: string;
	private trigger: RunTrigger;
	private executableNotFound: boolean;

	private documentListener: vscode.Disposable;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private delayers: { [key: string]: ThrottledDelayer<void> };

	constructor() {
		this.executable = null;
		this.validationEnabled = true;
		this.trigger = RunTrigger.onSave;
		this.executableNotFound = false;
	}

	public activate(subscriptions: vscode.Disposable[]) {
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
		subscriptions.push(this);
		vscode.workspace.onDidChangeConfiguration(this.loadConfiguration, this, subscriptions);
		this.loadConfiguration();

		vscode.workspace.onDidOpenTextDocument(this.triggerValidate, this, subscriptions);
		vscode.workspace.onDidCloseTextDocument((textDocument)=> {
			this.diagnosticCollection.delete(textDocument.uri);
			delete this.delayers[textDocument.uri.toString()];
		}, null, subscriptions);
	}

	public dispose(): void {
		this.diagnosticCollection.clear();
		this.diagnosticCollection.dispose();
	}

	private loadConfiguration(): void {
		let section = vscode.workspace.getConfiguration('php');
		let oldExecutable = this.executable;
		if (section) {
			this.validationEnabled = section.get<boolean>('validate.enable', true);
			this.executable = section.get<string>('validate.executablePath', null);
			this.trigger = RunTrigger.from(section.get<string>('validate.run', RunTrigger.strings.onSave));
		}
		this.delayers = Object.create(null);
		if (this.executableNotFound) {
			this.executableNotFound = oldExecutable === this.executable;
		}
		if (this.documentListener) {
			this.documentListener.dispose();
		}
		this.diagnosticCollection.clear();
		if (this.validationEnabled) {
			if (this.trigger === RunTrigger.onType) {
				this.documentListener = vscode.workspace.onDidChangeTextDocument((e) => {
					this.triggerValidate(e.document);
				});
			} else {
				this.documentListener = vscode.workspace.onDidSaveTextDocument(this.triggerValidate, this);
			}
			// Configuration has changed. Reevaluate all documents.
			vscode.workspace.textDocuments.forEach(this.triggerValidate, this);
		}
	}

	private triggerValidate(textDocument: vscode.TextDocument): void {
		if (textDocument.languageId !== 'php' || this.executableNotFound || !this.validationEnabled) {
			return;
		}
		let key = textDocument.uri.toString();
		let delayer = this.delayers[key];
		if (!delayer) {
			delayer = new ThrottledDelayer<void>(this.trigger === RunTrigger.onType ? 250 : 0);
			this.delayers[key] = delayer;
		}
		delayer.trigger(() => this.doValidate(textDocument) );
	}

	private doValidate(textDocument: vscode.TextDocument): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let executable = this.executable || 'php';
			let decoder = new LineDecoder();
			let diagnostics: vscode.Diagnostic[] = [];
			let processLine = (line: string) => {
				let matches = line.match(PHPValidationProvider.MatchExpression);
				if (matches) {
					let message = matches[1];
					let line = parseInt(matches[3]) - 1;
					let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
						new vscode.Range(line, 0, line, Number.MAX_VALUE),
						message
					);
					diagnostics.push(diagnostic);
				}
			};

			let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
			let args: string[];
			if (this.trigger === RunTrigger.onSave) {
				args = PHPValidationProvider.FileArgs.slice(0);
				args.push(textDocument.fileName);
			} else {
				args = PHPValidationProvider.BufferArgs;
			}
			try {
				let childProcess = cp.spawn(executable, args, options);
				childProcess.on('error', (error: Error) => {
					if (this.executableNotFound) {
						resolve();
						return;
					}
					this.showError(error, executable);
					this.executableNotFound = true;
					resolve();
				});
				if (childProcess.pid) {
					if (this.trigger === RunTrigger.onType) {
						childProcess.stdin.write(textDocument.getText());
						childProcess.stdin.end();
					}
					childProcess.stdout.on('data', (data: Buffer) => {
						decoder.write(data).forEach(processLine);
					});
					childProcess.stdout.on('end', () => {
						let line = decoder.end();
						if (line) {
							processLine(line);
						}
						this.diagnosticCollection.set(textDocument.uri, diagnostics);
						resolve();
					});
				} else {
					resolve();
				}
			} catch (error) {
				this.showError(error, executable);
			}
		});
	}

	private showError(error: any, executable: string): void {
		let message: string = null;
		if (error.code === 'ENOENT') {
			message = localize('noPHP', 'Cannot validate the php file. The php program was not found. Use the \'php.validate.executablePath\' setting to configure the location of \'php\'');
		} else {
			message = error.message ? error.message : localize('unknownReason', 'Failed to run php using path: {0}. Reason is unknown.', executable);
		}
		vscode.window.showInformationMessage(message);
	}
}