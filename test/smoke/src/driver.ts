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
}

export interface Driver {
	dispatchKeybinding(keybinding: string): Promise<void>;
	click(selector: string, xoffset?: number, yoffset?: number): Promise<any>;
	doubleClick(selector: string): Promise<any>;
	move(selector: string): Promise<any>;
	setValue(selector: string, text: string): Promise<void>;
	getTitle(): Promise<string>;

	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string): Promise<Element[]>;
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
					textContent: element.textContent || ''
				});
			}

			return result;
		}, selector) as any as Promise<{ value: Element[]; }>);

		return result.value;
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

	private async getWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
		}

		return this._activeWindowId;
	}

	async dispatchKeybinding(keybinding: string): Promise<void> {
		if (this.verbose) {
			console.log('- dispatchKeybinding:', keybinding);
		}

		const windowId = await this.getWindowId();
		await this.driver.dispatchKeybinding(windowId, keybinding);
	}

	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<any> {
		if (this.verbose) {
			console.log('- click:', selector);
		}

		throw new Error('Method not implemented.');
	}

	doubleClick(selector: string): Promise<any> {
		if (this.verbose) {
			console.log('- doubleClick:', selector);
		}

		throw new Error('Method not implemented.');
	}

	move(selector: string): Promise<any> {
		if (this.verbose) {
			console.log('- move:', selector);
		}

		throw new Error('Method not implemented.');
	}

	setValue(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- setValue:', selector, text);
		}

		throw new Error('Method not implemented.');
	}

	getTitle(): Promise<string> {
		if (this.verbose) {
			console.log('- getTitle:');
		}

		throw new Error('Method not implemented.');
	}

	isActiveElement(selector: string): Promise<boolean> {
		if (this.verbose) {
			console.log('- isActiveElement:', selector);
		}

		throw new Error('Method not implemented.');
	}

	async getElements(selector: string): Promise<Element[]> {
		if (this.verbose) {
			console.log('- getElements:', selector);
		}

		const windowId = await this.getWindowId();
		const result = await this.driver.getElements(windowId, selector);
		return result;
	}

	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P> {
		if (this.verbose) {
			console.log('- selectorExecute:', selector);
		}

		throw new Error('Method not implemented.');
	}
}