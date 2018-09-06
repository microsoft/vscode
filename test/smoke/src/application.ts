/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Workbench } from './areas/workbench/workbench';
import * as cp from 'child_process';
import { Code, spawn, SpawnOptions } from './vscode/code';
import { Logger } from './logger';

export const enum Quality {
	Dev,
	Insiders,
	Stable
}

export interface ApplicationOptions extends SpawnOptions {
	quality: Quality;
	workspacePath: string;
	workspaceFilePath: string;
	waitTime: number;
}

export class Application {

	private _code: Code | undefined;
	private _workbench: Workbench;

	constructor(private options: ApplicationOptions) { }

	get quality(): Quality {
		return this.options.quality;
	}

	get code(): Code {
		return this._code!;
	}

	get workbench(): Workbench {
		return this._workbench;
	}

	get logger(): Logger {
		return this.options.logger;
	}

	get workspacePath(): string {
		return this.options.workspacePath;
	}

	get extensionsPath(): string {
		return this.options.extensionsPath;
	}

	get userDataPath(): string {
		return this.options.userDataDir;
	}

	get workspaceFilePath(): string {
		return this.options.workspaceFilePath;
	}

	async start(): Promise<any> {
		await this._start();
		await this.code.waitForElement('.explorer-folders-view');
		await this.code.waitForActiveElement(`.editor-instance[id="workbench.editor.walkThroughPart"] > div > div[tabIndex="0"]`);
	}

	async restart(options: { workspaceOrFolder?: string, extraArgs?: string[] }): Promise<any> {
		await this.stop();
		await new Promise(c => setTimeout(c, 1000));
		await this._start(options.workspaceOrFolder, options.extraArgs);
	}

	private async _start(workspaceOrFolder = this.options.workspacePath, extraArgs: string[] = []): Promise<any> {
		cp.execSync('git checkout .', { cwd: this.options.workspacePath });
		await this.startApplication(workspaceOrFolder, extraArgs);
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
			this._code.dispose();
			this._code = undefined;
		}
	}

	async capturePage(): Promise<string> {
		return this.code.capturePage();
	}

	private async startApplication(workspaceOrFolder: string, extraArgs: string[] = []): Promise<any> {
		this._code = await spawn({
			codePath: this.options.codePath,
			workspacePath: workspaceOrFolder,
			userDataDir: this.options.userDataDir,
			extensionsPath: this.options.extensionsPath,
			logger: this.options.logger,
			verbose: this.options.verbose,
			log: this.options.log,
			extraArgs,
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

		// wait a bit, since focus might be stolen off widgets
		// as soon as they open (eg quick open)
		await new Promise(c => setTimeout(c, 500));
	}
}
