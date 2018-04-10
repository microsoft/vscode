/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronClient } from 'spectron';
import { IDriver } from './vscode/driver';

export interface Element {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string };
}

export interface Driver {
	dispatchKeybinding(keybinding: string): Promise<void>;
	click(selector: string, xoffset?: number, yoffset?: number): Promise<any>;
	doubleClick(selector: string): Promise<any>;
	move(selector: string): Promise<any>;
	setValue(selector: string, text: string): Promise<void>;
	getTitle(): Promise<string>;

	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string, recursive?: boolean): Promise<Element[]>;
	typeInEditor(selector: string, text: string): Promise<void>;
	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P>;
}

export class SpectronDriver implements Driver {

	constructor(
		private spectronClient: SpectronClient,
		private verbose: boolean
	) { }

	dispatchKeybinding(keybinding: string): Promise<void> {
		return Promise.reject(new Error('not implemented'));
	}

	async click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void> {
		if (this.verbose) {
			console.log('- click:', selector, xoffset, yoffset);
		}

		await this.spectronClient.leftClick(selector, xoffset, yoffset);

		if (this.verbose) {
			console.log('- click DONE');
		}
	}

	async doubleClick(selector: string): Promise<void> {
		if (this.verbose) {
			console.log('- doubleClick:', selector);
		}

		await this.spectronClient.doubleClick(selector);
	}

	async move(selector: string): Promise<void> {
		if (this.verbose) {
			console.log('- move:', selector);
		}

		await this.spectronClient.moveToObject(selector);
	}

	async setValue(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- setValue:', selector, text);
		}

		await this.spectronClient.setValue(selector, text);
	}

	async getTitle(): Promise<string> {
		if (this.verbose) {
			console.log('- getTitle');
		}

		return await this.spectronClient.getTitle();
	}

	async isActiveElement(selector: string): Promise<boolean> {
		if (this.verbose) {
			console.log('- isActiveElement:', selector);
		}

		const result = await (this.spectronClient.execute(s => document.activeElement.matches(s), selector) as any as Promise<{ value: boolean; }>);
		return result.value;
	}

	async getElements(selector: string): Promise<Element[]> {
		if (this.verbose) {
			console.log('- getElements:', selector);
		}

		const result = await (this.spectronClient.execute(selector => {
			const query = document.querySelectorAll(selector);
			const result: Element[] = [];

			for (let i = 0; i < query.length; i++) {
				const element: HTMLElement = query.item(i);

				result.push({
					tagName: element.tagName,
					className: element.className,
					textContent: element.textContent || '',
					attributes: {}
				});
			}

			return result;
		}, selector) as any as Promise<{ value: Element[]; }>);

		return result.value;
	}

	typeInEditor(selector: string, text: string): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P> {
		if (this.verbose) {
			console.log('- selectorExecute:', selector);
		}

		let _script = (element, script, ...args) => script(Array.isArray(element) ? element : [element], ...args);
		return this.spectronClient.selectorExecute(selector, _script, script, ...args);
	}
}

export class CodeDriver implements Driver {

	constructor(
		private driver: IDriver,
		private verbose: boolean
	) { }

	private _activeWindowId: number | undefined = undefined;

	async dispatchKeybinding(keybinding: string): Promise<void> {
		if (this.verbose) {
			console.log('- dispatchKeybinding:', keybinding);
		}

		const windowId = await this.getWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	async click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<any> {
		if (this.verbose) {
			console.log('- click:', selector);
		}

		const windowId = await this.getWindowId();
		await this.driver.click(windowId, selector, xoffset, yoffset);
	}

	async doubleClick(selector: string): Promise<any> {
		if (this.verbose) {
			console.log('- doubleClick:', selector);
		}

		const windowId = await this.getWindowId();
		await this.driver.doubleClick(windowId, selector);
	}

	async move(selector: string): Promise<any> {
		if (this.verbose) {
			console.log('- move:', selector);
		}

		const windowId = await this.getWindowId();
		await this.driver.move(windowId, selector);
	}

	async setValue(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- setValue:', selector, text);
		}

		const windowId = await this.getWindowId();
		await this.driver.setValue(windowId, selector, text);
	}

	async getTitle(): Promise<string> {
		if (this.verbose) {
			console.log('- getTitle:');
		}

		const windowId = await this.getWindowId();
		return await this.driver.getTitle(windowId);
	}

	async isActiveElement(selector: string): Promise<boolean> {
		if (this.verbose) {
			console.log('- isActiveElement:', selector);
		}

		const windowId = await this.getWindowId();
		return await this.driver.isActiveElement(windowId, selector);
	}

	async getElements(selector: string, recursive = false): Promise<Element[]> {
		if (this.verbose) {
			console.log('- getElements:', selector);
		}

		const windowId = await this.getWindowId();
		const result = await this.driver.getElements(windowId, selector, recursive);
		return result;
	}

	async selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P> {
		if (this.verbose) {
			console.log('- selectorExecute:', selector);
		}

		const windowId = await this.getWindowId();
		return await this.driver.selectorExecute(windowId, selector, script, ...args);
	}

	async typeInEditor(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- typeInEditor:', selector, text);
		}

		const windowId = await this.getWindowId();
		return await this.driver.typeInEditor(windowId, selector, text);
	}

	private async getWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
		}

		return this._activeWindowId;
	}
}