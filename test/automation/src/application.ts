/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Workbench } from './workbench';
import { Code, spawn, SpawnOptions } from './code';
import { Logger } from './logger';

export const enum Quality {
	Dev,
	Insiders,
	Stable
}

export interface ApplicationOptions extends SpawnOptions {
	quality: Quality;
	workspacePath: string;
	waitTime: number;
	screenshotsPath: string | null;
}

export class Application {

	private _code: Code | undefined;
	private _workbench: Workbench | undefined;

	constructor(private options: ApplicationOptions) {
		this._userDataPath = options.userDataDir;
		this._workspacePathOrFolder = options.workspacePath;
	}

	get quality(): Quality {
		return this.options.quality;
	}

	get code(): Code {
		return this._code!;
	}

	get workbench(): Workbench {
		return this._workbench!;
	}

	get logger(): Logger {
		return this.options.logger;
	}

	get remote(): boolean {
		return !!this.options.remote;
	}

	get web(): boolean {
		return !!this.options.web;
	}

	private _workspacePathOrFolder: string;
	get workspacePathOrFolder(): string {
		return this._workspacePathOrFolder;
	}

	get extensionsPath(): string {
		return this.options.extensionsPath;
	}

	private _userDataPath: string;
	get userDataPath(): string {
		return this._userDataPath;
	}

	async start(): Promise<any> {
		await this._start();
		await this.code.waitForElement('.explorer-folders-view');
	}

	async restart(options: { workspaceOrFolder?: string, extraArgs?: string[] }): Promise<any> {
		await this.stop();
		await new Promise(c => setTimeout(c, 1000));
		await this._start(options.workspaceOrFolder, options.extraArgs);
	}

	private async _start(workspaceOrFolder = this.workspacePathOrFolder, extraArgs: string[] = []): Promise<any> {
		this._workspacePathOrFolder = workspaceOrFolder;
		await this.startApplication(extraArgs);
		await this.checkWindowReady();
	}

	async reload(): Promise<any> {
		this.code.reload()
			.catch(err => null); // ignore the connection drop errors

		// needs to be enough to propagate the 'Reload Window' command
		await new Promise(c => setTimeout(c, 1500));
		await this.checkWindowReady();
	}

	async stop(): Promise<any> {
		if (this._code) {
			await this._code.exit();
			this._code.dispose();
			this._code = undefined;
		}
	}

	async captureScreenshot(name: string): Promise<void> {
		if (this.options.screenshotsPath) {
			const raw = await this.code.capturePage();
			const buffer = Buffer.from(raw, 'base64');
			const screenshotPath = path.join(this.options.screenshotsPath, `${name}.png`);
			if (this.options.log) {
				this.logger.log('*** Screenshot recorded:', screenshotPath);
			}
			fs.writeFileSync(screenshotPath, buffer);
		}
	}

	private async startApplication(extraArgs: string[] = []): Promise<any> {
		this._code = await spawn({
			...this.options,
			extraArgs: [...(this.options.extraArgs || []), ...extraArgs],
		});

		this._workbench = new Workbench(this._code, this.userDataPath);
	}

	private async checkWindowReady(): Promise<any> {
		if (!this.code) {
			console.error('No code instance found');
			return;
		}

		await this.code.waitForWindowIds(ids => ids.length > 0);
		await this.code.waitForElement('.monaco-workbench');

		if (this.remote) {
			await this.code.waitForTextContent('.monaco-workbench .statusbar-item[id="status.host"]', ' TestResolver', undefined, 2000);
		}

		// wait a bit, since focus might be stolen off widgets
		// as soon as they open (e.g. quick access)
		await new Promise(c => setTimeout(c, 1000));
	}
}
