/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { join } from 'path';
import { IDriver, IWindowDriver } from './driver';
import { PageFunction } from 'playwright-core/types/structs';
import { measureAndLog } from './logger';
import { LaunchOptions } from './code';
import { teardown } from './playwrightBrowser';

export class PlaywrightDriver implements IDriver {

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

	_serviceBrand: undefined;

	constructor(
		private readonly application: playwright.Browser | playwright.ElectronApplication,
		private readonly context: playwright.BrowserContext,
		private readonly page: playwright.Page,
		private readonly serverPid: number | undefined,
		private readonly options: LaunchOptions
	) {
	}

	async getWindowIds() {
		return [1];
	}

	async startTracing(windowId: number, name: string): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			await measureAndLog(this.context.tracing.startChunk({ title: name }), `startTracing for ${name}`, this.options.logger);
		} catch (error) {
			// Ignore
		}
	}

	async stopTracing(windowId: number, name: string, persist: boolean): Promise<void> {
		if (!this.options.tracing) {
			return; // tracing disabled
		}

		try {
			let persistPath: string | undefined = undefined;
			if (persist) {
				persistPath = join(this.options.logsPath, `playwright-trace-${PlaywrightDriver.traceCounter++}-${name.replace(/\s+/g, '-')}.zip`);
			}

			await measureAndLog(this.context.tracing.stopChunk({ path: persistPath }), `stopTracing for ${name}`, this.options.logger);

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

	private async takeScreenshot(name: string): Promise<void> {
		try {
			const persistPath = join(this.options.logsPath, `playwright-screenshot-${PlaywrightDriver.screenShotCounter++}-${name.replace(/\s+/g, '-')}.png`);

			await measureAndLog(this.page.screenshot({ path: persistPath, type: 'png' }), 'takeScreenshot', this.options.logger);
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
				await measureAndLog(this.context.tracing.stop(), 'stop tracing', this.options.logger);
			}
		} catch (error) {
			// Ignore
		}

		// VSCode shutdown (desktop only)
		let mainPid: number | undefined = undefined;
		if (!this.options.web) {
			try {
				mainPid = await measureAndLog(this._evaluateWithDriver(([driver]) => (driver as unknown as IDriver).exitApplication()), 'driver.exitApplication()', this.options.logger);
			} catch (error) {
				this.options.logger.log(`Error exiting appliction (${error})`);
			}
		}

		// Playwright shutdown
		try {
			await Promise.race([
				measureAndLog(this.application.close(), 'playwright.close()', this.options.logger),
				new Promise<void>(resolve => setTimeout(() => resolve(), 10000)) // TODO@bpasero mitigate https://github.com/microsoft/vscode/issues/146803
			]);
		} catch (error) {
			this.options.logger.log(`Error closing appliction (${error})`);
		}

		// Server shutdown
		if (typeof this.serverPid === 'number') {
			await measureAndLog(teardown(this.serverPid, this.options.logger), 'teardown server', this.options.logger);
		}

		return mainPid ?? this.serverPid! /* when running web we must have a server Pid */;
	}

	async dispatchKeybinding(windowId: number, keybinding: string) {
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

	async click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined) {
		const { x, y } = await this.getElementXY(windowId, selector, xoffset, yoffset);
		await this.page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
	}

	async setValue(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.setValue(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getTitle(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getTitle());
	}

	async isActiveElement(windowId: number, selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.isActiveElement(selector), [await this._getDriverHandle(), selector] as const);
	}

	async getElements(windowId: number, selector: string, recursive: boolean = false) {
		return this.page.evaluate(([driver, selector, recursive]) => driver.getElements(selector, recursive), [await this._getDriverHandle(), selector, recursive] as const);
	}

	async getElementXY(windowId: number, selector: string, xoffset?: number, yoffset?: number) {
		return this.page.evaluate(([driver, selector, xoffset, yoffset]) => driver.getElementXY(selector, xoffset, yoffset), [await this._getDriverHandle(), selector, xoffset, yoffset] as const);
	}

	async typeInEditor(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.typeInEditor(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getTerminalBuffer(windowId: number, selector: string) {
		return this.page.evaluate(([driver, selector]) => driver.getTerminalBuffer(selector), [await this._getDriverHandle(), selector] as const);
	}

	async writeInTerminal(windowId: number, selector: string, text: string) {
		return this.page.evaluate(([driver, selector, text]) => driver.writeInTerminal(selector, text), [await this._getDriverHandle(), selector, text] as const);
	}

	async getLocaleInfo(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocaleInfo());
	}

	async getLocalizedStrings(windowId: number) {
		return this._evaluateWithDriver(([driver]) => driver.getLocalizedStrings());
	}

	private async _evaluateWithDriver<T>(pageFunction: PageFunction<playwright.JSHandle<IWindowDriver>[], T>) {
		return this.page.evaluate(pageFunction, [await this._getDriverHandle()]);
	}

	private timeout(ms: number): Promise<void> {
		return new Promise<void>(resolve => setTimeout(resolve, ms));
	}

	private async _getDriverHandle(): Promise<playwright.JSHandle<IWindowDriver>> {
		return this.page.evaluateHandle('window.driver');
	}
}
