/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Tail } from 'tail';

export class LogStreamer implements vscode.Disposable {
	private _tail: Tail;
	private _linesCounter: number = 0;

	constructor(
		private _output: vscode.OutputChannel,
		private _path: string,
		private _prefix?: string,
	) {
		this._tail = new Tail(this._path, { fromBeginning: true, useWatchFile: true });

		this._tail.on('line', (line) => this.appendLine(line));
		this._tail.on('error', (error) => this.appendLine(error));
	}

	public async watch() {
		for (let retry = 0; retry < 50; retry++) {
			if (fs.existsSync(this._path)) {
				break;
			} else {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}

		if (!fs.existsSync(this._path)) {
			this.appendLine(`Log file '${this._path}' not found after 10 seconds.`);
			return;
		}

		try {
			const lines = fs.readFileSync(this._path, 'utf8').split('\n');
			this._linesCounter = lines.length;
		} catch (err) {
			this.appendLine(`Error reading initial contents of log file '${this._path}': ${err.message || JSON.stringify(err)}`);
		}

		this._tail.watch();
	}

	private appendLine(line: string) {
		this._linesCounter += 1;

		if (this._prefix) {
			this._output.appendLine(`[${this._prefix}] ${line}`);
		} else {
			this._output.appendLine(line);
		}
	}

	public dispose() {
		this._tail.unwatch();

		if (!fs.existsSync(this._path)) {
			return;
		}

		const lines = fs.readFileSync(this._path, 'utf8').split('\n');

		for (let i = this._linesCounter + 1; i < lines.length; ++i) {
			this.appendLine(lines[i]);
		}
	}
}
