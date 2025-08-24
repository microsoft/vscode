/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { delay } from './util';

export class ArkAttachOnStartup {
	_delayDir?: string;
	_delayFile?: string;

	init(args: Array<String>) {
		this._delayDir = fs.mkdtempSync(`${os.tmpdir()}-JupyterDelayStartup`);
		this._delayFile = path.join(this._delayDir, 'file');

		fs.writeFileSync(this._delayFile!, 'create\n');

		let loc = args.findIndex((elt) => elt === '--');

		if (loc === -1) {
			loc = args.length;
		}

		args.splice(loc, 0, '--startup-notifier-file', this._delayFile);
	}

	async attach() {
		await vscode.commands.executeCommand('workbench.action.debug.start');

		fs.writeFileSync(this._delayFile!, 'go\n');

		delay(100).then(() => {
			fs.rmSync(this._delayDir!, { recursive: true, force: true });
		});
	}
}

export class ArkDelayStartup {
	init(args: Array<String>, delay: number) {
		let loc = args.findIndex((elt) => elt === '--');

		if (loc === -1) {
			loc = args.length;
		}

		args.splice(loc, 0, '--startup-delay', delay.toString());
	}
}
