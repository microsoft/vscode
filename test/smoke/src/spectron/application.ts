/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, SpectronClient as WebClient } from 'spectron';
import { SpectronClient } from './client';
import { NullScreenshot, IScreenshot } from '../helpers/screenshot';
import { Workbench } from '../areas/workbench/workbench';
import * as fs from 'fs';
import * as path from 'path';

export const LATEST_PATH = process.env.VSCODE_PATH as string;
export const STABLE_PATH = process.env.VSCODE_STABLE_PATH || '';
export const WORKSPACE_PATH = process.env.SMOKETEST_REPO as string;
export const CODE_WORKSPACE_PATH = process.env.VSCODE_WORKSPACE_PATH as string;
export const USER_DIR = process.env.VSCODE_USER_DIR as string;
export const EXTENSIONS_DIR = process.env.VSCODE_EXTENSIONS_DIR as string;
export const VSCODE_EDITION = process.env.VSCODE_EDITION as string;

export enum VSCODE_BUILD {
	DEV,
	INSIDERS,
	STABLE
}

/**
 * Wraps Spectron's Application instance with its used methods.
 */
export class SpectronApplication {

	private _client: SpectronClient;
	private _workbench: Workbench;
	private _screenshot: IScreenshot;
	private spectron: Application;
	private keybindings: any[];

	constructor(private _electronPath: string = LATEST_PATH, private _workspace: string = WORKSPACE_PATH, private _userDir: string = USER_DIR) {
	}

	public get build(): VSCODE_BUILD {
		switch (VSCODE_EDITION) {
			case 'dev':
				return VSCODE_BUILD.DEV;
			case 'insiders':
				return VSCODE_BUILD.INSIDERS;
		}
		return VSCODE_BUILD.STABLE;
	}

	public get app(): Application {
		return this.spectron;
	}

	public get client(): SpectronClient {
		return this._client;
	}

	public get webclient(): WebClient {
		return this.spectron.client;
	}

	public get screenshot(): IScreenshot {
		return this._screenshot;
	}

	public get workbench(): Workbench {
		return this._workbench;
	}

	public async start(): Promise<any> {
		await this.retrieveKeybindings();
		await this.startApplication();
		await this.client.windowByIndex(1); // focuses on main renderer window
		await this.checkWindowReady();
	}

	public async reload(): Promise<any> {
		await this.workbench.commandPallette.runCommand('Reload Window');
		// TODO @sandy: Find a proper condition to wait for reload
		await this.wait(.5);
		await this.client.waitForHTML('[id="workbench.main.container"]');
	}

	public async stop(): Promise<any> {
		if (this.spectron && this.spectron.isRunning()) {
			return await this.spectron.stop();
		}
	}

	public wait(seconds: number = 1): Promise<any> {
		return new Promise(resolve => setTimeout(resolve, seconds * 1000));
	}

	private async startApplication(): Promise<any> {

		let args: string[] = [];
		let chromeDriverArgs: string[] = [];

		if (process.env.VSCODE_REPOSITORY) {
			args.push(process.env.VSCODE_REPOSITORY as string);
		}

		args.push(this._workspace);
		// Prevent 'Getting Started' web page from opening on clean user-data-dir
		args.push('--skip-getting-started');
		// Ensure that running over custom extensions directory, rather than picking up the one that was used by a tester previously
		args.push(`--extensions-dir=${path.join(EXTENSIONS_DIR, new Date().getTime().toString())}`);

		chromeDriverArgs.push(`--user-data-dir=${path.join(this._userDir, new Date().getTime().toString())}`);

		this.spectron = new Application({
			path: this._electronPath,
			args,
			chromeDriverArgs,
			startTimeout: 10000,
			requireName: 'nodeRequire'
		});
		await this.spectron.start();

		this._screenshot = new NullScreenshot();
		this._client = new SpectronClient(this.spectron, this.screenshot);
		this._workbench = new Workbench(this);
	}

	private async checkWindowReady(): Promise<any> {
		await this.client.waitForHTML('[id="workbench.main.container"]');
		await this.client.waitForElement('.explorer-folders-view');
		await this.client.waitForElement(`.editor-container[id="workbench.editor.walkThroughPart"] .welcomePage`);
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

	/**
	 * Retrieves the command from keybindings file and executes it with WebdriverIO client API
	 * @param command command (e.g. 'workbench.action.files.newUntitledFile')
	 */
	public command(command: string, capture?: boolean): Promise<any> {
		const binding = this.keybindings.find(x => x['command'] === command);
		if (!binding) {
			return this.workbench.commandPallette.runCommand(command);
		}

		const keys: string = binding.key;
		let keysToPress: string[] = [];

		const chords = keys.split(' ');
		chords.forEach((chord) => {
			const keys = chord.split('+');
			keys.forEach((key) => keysToPress.push(this.transliterate(key)));
			keysToPress.push('NULL');
		});

		return this.client.keys(keysToPress, capture);
	}

	/**
	 * Transliterates key names from keybindings file to WebdriverIO keyboard actions defined in:
	 * https://w3c.github.io/webdriver/webdriver-spec.html#keyboard-actions
	 */
	private transliterate(key: string): string {
		switch (key) {
			case 'ctrl':
				return 'Control';
			case 'cmd':
				return 'Meta';
			default:
				return key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1);
		};
	}
}
