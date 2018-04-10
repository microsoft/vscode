/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ScreenCapturer } from './helpers/screenshot';
import { Driver, Element } from './driver';

export class API {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 1000; // in milliseconds

	constructor(
		private driver: Driver,
		private screenCapturer: ScreenCapturer,
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

	waitForElements(selector: string, recursive: boolean, accept: (result: Element[]) => boolean = result => result.length > 0): Promise<Element[]> {
		return this.waitFor(() => this.driver.getElements(selector, recursive), accept, `elements with selector ${selector}`) as Promise<any>;
	}

	waitForElement(selector: string, accept: (result: Element | undefined) => boolean = result => !!result): Promise<void> {
		return this.waitFor(() => this.driver.getElements(selector).then(els => els[0]), accept, `element with selector ${selector}`) as Promise<any>;
	}

	waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(() => this.driver.isActiveElement(selector), undefined, `wait for active element: ${selector}`);
	}

	getTitle(): Promise<string> {
		return this.driver.getTitle();
	}

	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P> {
		return this.driver.selectorExecute(selector, script, ...args);
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
					await this.screenCapturer.capture('timeout');
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