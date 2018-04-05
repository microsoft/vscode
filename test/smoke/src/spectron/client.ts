/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from 'spectron';
import { RawResult, Element } from 'webdriverio';
import { SpectronApplication } from './application';

export class SpectronClient {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 100; // in milliseconds

	constructor(
		readonly spectron: Application,
		private application: SpectronApplication,
		waitTime: number
	) {
		this.retryCount = (waitTime * 1000) / this.retryDuration;
	}

	keys(keys: string[]): Promise<void> {
		this.spectron.client.keys(keys);
		return Promise.resolve();
	}

	async waitForText(selector: string, text?: string, accept?: (result: string) => boolean): Promise<string> {
		accept = accept ? accept : result => text !== void 0 ? text === result : !!result;
		return this.waitFor(() => this.spectron.client.getText(selector), accept, `getText with selector ${selector}`);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
		accept = accept ? accept : (result => textContent !== void 0 ? textContent === result : !!result);
		const fn = async () => await this.spectron.client.selectorExecute(selector, div => Array.isArray(div) ? div[0].textContent : div.textContent);
		return this.waitFor(fn, s => accept!(typeof s === 'string' ? s : ''), `getTextContent with selector ${selector}`);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number): Promise<any> {
		return this.waitFor(() => this.spectron.client.leftClick(selector, xoffset, yoffset), void 0, `click with selector ${selector}`);
	}

	async waitAndDoubleClick(selector: string, capture: boolean = true): Promise<any> {
		return this.waitFor(() => this.spectron.client.doubleClick(selector), void 0, `doubleClick with selector ${selector}`);
	}

	async waitAndMoveToObject(selector: string): Promise<any> {
		return this.waitFor(() => this.spectron.client.moveToObject(selector), void 0, `move to object with selector ${selector}`);
	}

	async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.setValue(selector, text);
	}

	async doesElementExist(selector: string): Promise<boolean> {
		return this.spectron.client.element(selector).then(result => !!result.value);
	}

	async waitForElements(selector: string, accept: (result: Element[]) => boolean = result => result.length > 0): Promise<void> {
		return this.waitFor(() => this.spectron.client.elements(selector), result => accept(result.value), `elements with selector ${selector}`) as Promise<any>;
	}

	async waitForElement(selector: string, accept: (result: Element | undefined) => boolean = result => !!result): Promise<void> {
		return this.waitFor<RawResult<Element>>(() => this.spectron.client.element(selector), result => accept(result ? result.value : void 0), `element with selector ${selector}`) as Promise<any>;
	}

	async waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(
			() => this.spectron.client.execute(s => document.activeElement.matches(s), selector),
			r => r.value,
			`wait for active element: ${selector}`
		);
	}

	async getTitle(): Promise<string> {
		return this.spectron.client.getTitle();
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
					await this.application.screenCapturer.capture('timeout');
					throw new Error(`${timeoutMessage}: Timed out after ${(retryCount * this.retryDuration) / 1000} seconds.`);
				}

				let result;
				try {
					result = await func();
				} catch (e) {
					// console.log(e);
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