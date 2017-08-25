/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from 'spectron';
import { SpectronClient } from './client';
import { Screenshot } from '../helpers/screenshot';
var fs = require('fs');
var path = require('path');

export const LATEST_PATH = process.env.VSCODE_LATEST_PATH;
export const STABLE_PATH = process.env.VSCODE_STABLE_PATH;
export const WORKSPACE_PATH = process.env.SMOKETEST_REPO;
export const CODE_WORKSPACE_PATH = process.env.VSCODE_WORKSPACE_PATH;
export const USER_DIR = 'test_data/temp_user_dir';
export const EXTENSIONS_DIR = 'test_data/temp_extensions_dir';

/**
 * Wraps Spectron's Application instance with its used methods.
 */
export class SpectronApplication {
	public client: SpectronClient;

	private spectron: Application;
	private keybindings: any[];
	private screenshot: Screenshot;

	private readonly sampleExtensionsDir: string = 'test_data/sample_extensions_dir';
	private readonly pollTrials = 50;
	private readonly pollTimeout = 1; // in secs

	constructor(electronPath: string, testName: string, private testRetry: number, args?: string[], chromeDriverArgs?: string[]) {
		if (!args) {
			args = [];
		}

		// Prevent 'Getting Started' web page from opening on clean user-data-dir
		args.push('--skip-getting-started');

		// Ensure that running over custom extensions directory, rather than picking up the one that was used by a tester previously
		let extensionDirIsSet = false;
		for (let arg of args) {
			if (arg.startsWith('--extensions-dir')) {
				extensionDirIsSet = true;
				break;
			}
		}
		if (!extensionDirIsSet) {
			args.push(`--extensions-dir=${this.sampleExtensionsDir}`);
		}

		this.spectron = new Application({
			path: electronPath,
			args: args,
			chromeDriverArgs: chromeDriverArgs,
			startTimeout: 10000,
			requireName: 'nodeRequire'
		});
		this.testRetry += 1; // avoid multiplication by 0 for wait times
		this.screenshot = new Screenshot(this, testName, testRetry);
		this.client = new SpectronClient(this.spectron, this.screenshot);
		this.retrieveKeybindings();
	}

	public get app(): Application {
		return this.spectron;
	}

	public async start(): Promise<any> {
		await this.spectron.start();
		await this.focusOnWindow(1); // focuses on main renderer window
		await this.checkWindowReady();
	}

	public async stop(): Promise<any> {
		if (this.spectron && this.spectron.isRunning()) {
			return await this.spectron.stop();
		}
	}

	public waitFor(func: (...args: any[]) => any, args: any): Promise<any> {
		return this.callClientAPI(func, args);
	}

	public wait(): Promise<any> {
		return new Promise(resolve => setTimeout(resolve, this.testRetry * this.pollTimeout * 1000));
	}

	public focusOnWindow(index: number): Promise<any> {
		return this.client.windowByIndex(index);
	}

	private async checkWindowReady(): Promise<any> {
		await this.waitFor(this.spectron.client.getHTML, '[id="workbench.main.container"]');
	}

	private retrieveKeybindings() {
		fs.readFile(path.join(process.cwd(), `test_data/keybindings.json`), 'utf8', (err, data) => {
			if (err) {
				throw err;
			}
			try {
				this.keybindings = JSON.parse(data);
			} catch (e) {
				throw new Error(`Error parsing keybindings JSON: ${e}`);
			}
		});
	}

	private async callClientAPI(func: (...args: any[]) => Promise<any>, args: any): Promise<any> {
		let trial = 1;

		while (true) {
			if (trial > this.pollTrials) {
				throw new Error(`Could not retrieve the element in ${this.testRetry * this.pollTrials * this.pollTimeout} seconds.`);
			}

			let result;
			try {
				result = await func.call(this.client, args, false);
			} catch (e) { }

			if (result && result !== '') {
				await this.screenshot.capture();
				return result;
			}

			await this.wait();
			trial++;
		}
	}

	/**
	 * Retrieves the command from keybindings file and executes it with WebdriverIO client API
	 * @param command command (e.g. 'workbench.action.files.newUntitledFile')
	 */
	public command(command: string, capture?: boolean): Promise<any> {
		const binding = this.keybindings.find(x => x['command'] === command);
		if (!binding) {
			return Promise.reject(`Key binding for ${command} was not found.`);
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
