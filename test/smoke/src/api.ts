/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDriver, IElement } from './vscode/driver';

export class CodeDriver {

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

	async getElements(selector: string, recursive = false): Promise<IElement[]> {
		if (this.verbose) {
			console.log('- getElements:', selector);
		}

		const windowId = await this.getWindowId();
		return await this.driver.getElements(windowId, selector, recursive);
	}

	async typeInEditor(selector: string, text: string): Promise<void> {
		if (this.verbose) {
			console.log('- typeInEditor:', selector, text);
		}

		const windowId = await this.getWindowId();
		return await this.driver.typeInEditor(windowId, selector, text);
	}

	async getTerminalBuffer(selector: string): Promise<string[]> {
		if (this.verbose) {
			console.log('- getTerminalBuffer:', selector);
		}

		const windowId = await this.getWindowId();
		return await this.driver.getTerminalBuffer(windowId, selector);
	}

	private async getWindowId(): Promise<number> {
		if (typeof this._activeWindowId !== 'number') {
			const windows = await this.driver.getWindowIds();
			this._activeWindowId = windows[0];
		}

		return this._activeWindowId;
	}
}

export function findElement(element: IElement, fn: (element: IElement) => boolean): IElement | null {
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			return element;
		}

		queue.push(...element.children);
	}

	return null;
}

export function findElements(element: IElement, fn: (element: IElement) => boolean): IElement[] {
	const result: IElement[] = [];
	const queue = [element];

	while (queue.length > 0) {
		const element = queue.shift()!;

		if (fn(element)) {
			result.push(element);
		}

		queue.push(...element.children);
	}

	return result;
}

export class API {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 100; // in milliseconds

	constructor(
		private driver: CodeDriver,
		waitTime: number
	) {
		this.retryCount = (waitTime * 1000) / this.retryDuration;
	}

	dispatchKeybinding(keybinding: string): Promise<void> {
		return this.driver.dispatchKeybinding(keybinding);
	}

	waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
		accept = accept ? accept : (result => textContent !== void 0 ? textContent === result : !!result);
		return this.waitFor(() => this.driver.getElements(selector).then(els => els[0].textContent), s => accept!(typeof s === 'string' ? s : ''), `getTextContent with selector ${selector}`);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number): Promise<any> {
		await this.waitForElement(selector);
		return await this.driver.click(selector, xoffset, yoffset);
	}

	async waitAndDoubleClick(selector: string): Promise<any> {
		await this.waitForElement(selector);
		return await this.driver.doubleClick(selector);
	}

	async waitAndMove(selector: string): Promise<any> {
		await this.waitForElement(selector);
		return await this.driver.move(selector);
	}

	async setValue(selector: string, text: string): Promise<any> {
		await this.waitForElement(selector);
		return await this.driver.setValue(selector, text);
	}

	async doesElementExist(selector: string): Promise<boolean> {
		const elements = await this.driver.getElements(selector);
		return elements.length > 0;
	}

	async getElementCount(selector: string): Promise<number> {
		const elements = await this.driver.getElements(selector);
		return elements.length;
	}

	waitForElements(selector: string, recursive: boolean, accept: (result: IElement[]) => boolean = result => result.length > 0): Promise<IElement[]> {
		return this.waitFor(() => this.driver.getElements(selector, recursive), accept, `elements with selector ${selector}`) as Promise<any>;
	}

	waitForElement(selector: string, accept: (result: IElement | undefined) => boolean = result => !!result): Promise<void> {
		return this.waitFor(() => this.driver.getElements(selector).then(els => els[0]), accept, `element with selector ${selector}`) as Promise<any>;
	}

	waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(() => this.driver.isActiveElement(selector), undefined, `wait for active element: ${selector}`);
	}

	getTitle(): Promise<string> {
		return this.driver.getTitle();
	}

	typeInEditor(selector: string, text: string): Promise<void> {
		return this.driver.typeInEditor(selector, text);
	}

	getTerminalBuffer(selector: string): Promise<string[]> {
		return this.driver.getTerminalBuffer(selector);
	}

	private running = false;
	async waitFor<T>(func: () => T | Promise<T | undefined>, accept?: (result: T) => boolean | Promise<boolean>, timeoutMessage?: string, retryCount?: number): Promise<T>;
	async waitFor<T>(func: () => T | Promise<T>, accept: (result: T) => boolean | Promise<boolean> = result => !!result, timeoutMessage?: string, retryCount?: number): Promise<T> {
		if (this.running) {
			throw new Error('Not allowed to run nested waitFor calls!');
		}

		this.running = true;

		try {
			let trial = 1;
			retryCount = typeof retryCount === 'number' ? retryCount : this.retryCount;

			while (true) {
				if (trial > retryCount) {
					throw new Error(`${timeoutMessage}: Timed out after ${(retryCount * this.retryDuration) / 1000} seconds.`);
				}

				let result;
				try {
					result = await func();
				} catch (e) {
					// console.warn(e);

					if (/Method not implemented/.test(e.message)) {
						throw e;
					}
				}

				if (accept(result)) {
					return result;
				}

				await new Promise(resolve => setTimeout(resolve, this.retryDuration));
				trial++;
			}
		} finally {
			this.running = false;
		}
	}
}