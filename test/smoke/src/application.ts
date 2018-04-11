/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from './api';
import { Workbench } from './areas/workbench/workbench';
import * as fs from 'fs';
import * as cp from 'child_process';
import { CodeDriver } from './driver';
import { Code, spawn, SpawnOptions } from './vscode/code';

export enum Quality {
	Dev,
	Insiders,
	Stable
}

export interface SpectronApplicationOptions extends SpawnOptions {
	quality: Quality;
	electronPath: string;
	workspacePath: string;
	artifactsPath: string;
	workspaceFilePath: string;
	waitTime: number;
	verbose: boolean;
}

/**
 * Wraps Spectron's Application instance with its used methods.
 */
export class SpectronApplication {

	// private static count = 0;

	private _api: API;
	private _workbench: Workbench;
	private codeInstance: Code | undefined;
	private keybindings: any[];
	private stopLogCollection: (() => Promise<void>) | undefined;

	constructor(
		private options: SpectronApplicationOptions
	) { }

	get quality(): Quality {
		return this.options.quality;
	}

	get api(): API {
		return this._api;
	}

	get workbench(): Workbench {
		return this._workbench;
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

	async start(waitForWelcome: boolean = true): Promise<any> {
		await this._start();

		if (waitForWelcome) {
			await this.waitForWelcome();
		}
	}

	async restart(options: { workspaceOrFolder?: string, extraArgs?: string[] }): Promise<any> {
		await this.stop();
		await new Promise(c => setTimeout(c, 1000));
		await this._start(options.workspaceOrFolder, options.extraArgs);
	}

	private async _start(workspaceOrFolder = this.options.workspacePath, extraArgs: string[] = []): Promise<any> {
		await this.retrieveKeybindings();
		cp.execSync('git checkout .', { cwd: this.options.workspacePath });
		await this.startApplication(workspaceOrFolder, extraArgs);
		await this.checkWindowReady();
	}

	async reload(): Promise<any> {
		this.workbench.runCommand('Reload Window')
			.catch(err => null); // ignore the connection drop errors

		// needs to be enough to propagate the 'Reload Window' command
		await new Promise(c => setTimeout(c, 1500));
		await this.checkWindowReady();
	}

	async stop(): Promise<any> {
		if (this.stopLogCollection) {
			await this.stopLogCollection();
			this.stopLogCollection = undefined;
		}

		if (this.codeInstance) {
			this.codeInstance.dispose();
			this.codeInstance = undefined;
		}
	}

	private async startApplication(workspaceOrFolder: string, extraArgs: string[] = []): Promise<any> {
		this.codeInstance = await spawn({
			codePath: this.options.codePath,
			workspacePath: workspaceOrFolder,
			userDataDir: this.options.userDataDir,
			extensionsPath: this.options.extensionsPath,
			verbose: this.options.verbose,
			extraArgs
		});

		const driver = new CodeDriver(this.codeInstance.driver, this.options.verbose);
		this._api = new API(driver, this.options.waitTime);
		this._workbench = new Workbench(this._api, this.keybindings, this.userDataPath);
	}

	private async checkWindowReady(): Promise<any> {
		if (!this.codeInstance) {
			console.error('No code instance found');
			return;
		}

		let retries = 0;

		while (++retries < 300) { // 30 seconds
			const ids = await this.codeInstance.driver.getWindowIds();

			if (ids.length > 0) {
				break;
			}

			await new Promise(c => setTimeout(c, 100));
		}

		await this.api.waitForElement('.monaco-workbench');
	}

	private async waitForWelcome(): Promise<any> {
		await this.api.waitForElement('.explorer-folders-view');
		await this.api.waitForElement(`.editor-container[id="workbench.editor.walkThroughPart"] .welcomePage`);
	}

	private retrieveKeybindings(): Promise<void> {
		return new Promise((c, e) => {
			fs.readFile(process.env.VSCODE_KEYBINDINGS_PATH as string, 'utf8', (err, data) => {
				if (err) {
					throw err;
				}
				try {
					this.keybindings = JSON.parse(data);
					c();
				} catch (e) {
					throw new Error(`Error parsing keybindings JSON: ${e}`);
				}
			});
		});
	}
}
