/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { join } from 'path';
import { IWindowDriver } from './driver';
import { PageFunction } from 'playwright-core/types/structs';
import { measureAndLog } from './logger';
import { LaunchOptions } from './code';
import { teardown } from './processes';
import { ChildProcess } from 'child_process';

export class PlaywrightDriver {

	private static traceCounter = 1;
	private static screenShotCounter = 1;

	private static readonly vscodeToPlaywrightKey: { [key: string]: string } = {
		cmd: 'Meta',
		ctrl: 'Control',
		shift: 'Shift',
		enter: 'Enter',
		escape: 'Escape',
		right: 'ArrowRight',
		up: 'ArrowUp',
		down: 'ArrowDown',
		left: 'ArrowLeft',
		home: 'Home',
		esc: 'Escape'
	};

	constructor(
		private readonly application: playwright.Browser | playwright.ElectronApplication,
		private readonly context: playwright.BrowserContext,
		private readonly page: playwright.Page,
		private readonly serverProcess: ChildProcess | undefined,
		private readonly options: LaunchOptions
	) {
	}

	async startTracing(name: string): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			await measureAndLog(() => this.context.tracing.startChunk({ title: name }), `startTracing for ${name}`, this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async stopTracing(name: string, persist: boolean): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			let persistPath: string | undefined = undefined;
			if (persist) {
				persistPath = join(this.options.logsPath, `playwright-trace-${PlaywrightDriver.traceCounter++}-${name.replace(/\s+/g, '-')}.zip`);
			}

			await measureAndLog(() => this.context.tracing.stopChunk({ path: persistPath }), `stopTracing for ${name}`, this.options.logger);

			// To ensure we have a screenshot at the end where
			// it failed, also trigger one explicitly. Tracing
			// does not guarantee to give us a screenshot unless
			// some driver action ran before.
			if (persist) {
				await this.takeScreenshot(name);
			}
		} catch (error) {
			// Ignore
		}
	}

	async didFinishLoad(): Promise<void> {

		// Web: via `load` state
		if (this.options.web) {
			return this.page.waitForLoadState('load');
		}

		// Desktop: via `window` event
		return new Promise<void>(resolve => {
			// https://playwright.dev/docs/api/class-electronapplication#electron-application-event-window
			(this.application as playwright.ElectronApplication).on('window', () => resolve());
		});
	}

	private async takeScreenshot(name: string): Promise<void> {
		try {
			const persistPath = join(this.options.logsPath, `playwright-screenshot-${PlaywrightDriver.screenShotCounter++}-${name.replace(/\s+/g, '-')}.png`);

			await measureAndLog(() => this.page.screenshot({ path: persistPath, type: 'png' }), 'takeScreenshot', this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async reload() {
		await this.page.reload();
	}

	async exitApplication() {

		// Stop tracing
		try {
			if (this.options.tracing) {
				await measureAndLog(() => this.context.tracing.stop(), 'stop tracing', this.options.logger);
			}
		} catch (error) {
			// Ignore
		}

		// Web: exit via `close` method
		if (this.options.web) {
			try {
				await measureAndLog(() => this.application.close(), 'playwright.close()', this.options.logger);
			} catch (error) {
				this.options.logger.log(`Error closing appliction (${error})`);
			}
		}

		// Desktop: exit via `driver.exitApplication`
		else {
			try {
				await measureAndLog(() => this.evaluateWithDriver(([driver]) => driver.exitApplication()), 'driver.exitApplication()', this.options.logger);
			} catch (error) {
				this.options.logger.log(`Error exiting appliction (${error})`);
			}
		}

		// Server: via `teardown`
		if (this.serverProcess) {
			await measureAndLog(() => teardown(this.serverProcess!, this.options.logger), 'teardown server process', this.options.logger);
		}
	}

	async dispatchKeybinding(keybinding: string) {
		const chords = keybinding.split(' ');
		for (let i = 0; i < chords.length; i++) {
			const chord = chords[i];
			if (i > 0) {
				await this.timeout(100);
			}

			if (keybinding.startsWith('Alt') || keybinding.startsWith('Control') || keybinding.startsWith('Backspace')) {
				await this.page.keyboard.press(keybinding);
				return;
			}

			const keys = chord.split('+');
			const keysDown: string[] = [];
			for (let i = 0; i < keys.length; i++) {
				if (keys[i] in PlaywrightDriver.vscodeToPlaywrightKey) {
					keys[i] = PlaywrightDriver.vscodeToPlaywrightKey[keys[i]];
				}
				await this.page.keyboard.down(keys[i]);
				keysDown.push(keys[i]);
			}
			while (keysDown.length > 0) {
				await this.page.keyboard.up(keysDown.pop()!);
			}
		}

		await this.timeout(100);
	}

	async click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined) {
		const { x, y } = await this.getElementXY(selector, xoffset, yoffset);
		await this.page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
	}

	async setValue(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.setValue(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getTitle() {
		return this.evaluateWithDriver(([driver]) => driver.getTitle());
	}

	async isActiveElement(selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.isActiveElement(selector), [await this.getDriverHandle(), selector] as const);
	}

	async getElements(selector: string, recursive: boolean = false) {
		return this.page.evaluate(([driver, selector, recursive]) => driver.getElements(selector, recursive), [await this.getDriverHandle(), selector, recursive] as const);
	}

	async getElementXY(selector: string, xoffset?: number, yoffset?: number) {
		return this.page.evaluate(([driver, selector, xoffset, yoffset]) => driver.getElementXY(selector, xoffset, yoffset), [await this.getDriverHandle(), selector, xoffset, yoffset] as const);
	}

	async typeInEditor(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.typeInEditor(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getTerminalBuffer(selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.getTerminalBuffer(selector), [await this.getDriverHandle(), selector] as const);
	}

	async writeInTerminal(selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.writeInTerminal(selector, text), [await this.getDriverHandle(), selector, text] as const);
	}

	async getLocaleInfo() {
		return this.evaluateWithDriver(([driver]) => driver.getLocaleInfo());
	}

	async getLocalizedStrings() {
		return this.evaluateWithDriver(([driver]) => driver.getLocalizedStrings());
	}

	private async evaluateWithDriver<T>(pageFunction: PageFunction<playwright.JSHandle<IWindowDriver>[], T>) {
		return this.page.evaluate(pageFunction, [await this.getDriverHandle()]);
	}

	private timeout(ms: number): Promise<void> {
		return new Promise<void>(resolve => setTimeout(resolve, ms));
	}

	private async getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this.page.evaluateHandle('window.driver');
	}
}
