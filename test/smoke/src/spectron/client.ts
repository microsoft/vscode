/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from 'spectron';
import { RawResult, Element } from 'webdriverio';
import { SpectronApplication } from './application';

/**
 * Abstracts the Spectron's WebdriverIO managed client property on the created Application instances.
 */
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

	async getText(selector: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.getText(selector);
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

	async waitForValue(selector: string, value?: string, accept?: (result: string) => boolean): Promise<any> {
		accept = accept ? accept : result => value !== void 0 ? value === result : !!result;
		return this.waitFor(() => this.spectron.client.getValue(selector), accept, `getValue with selector ${selector}`);
	}

	async waitAndClick(selector: string): Promise<any> {
		return this.waitFor(() => this.spectron.client.click(selector), void 0, `click with selector ${selector}`);
	}

	async click(selector: string): Promise<any> {
		return this.spectron.client.click(selector);
	}

	async doubleClickAndWait(selector: string, capture: boolean = true): Promise<any> {
		return this.waitFor(() => this.spectron.client.doubleClick(selector), void 0, `doubleClick with selector ${selector}`);
	}

	async leftClick(selector: string, xoffset: number, yoffset: number, capture: boolean = true): Promise<any> {
		return this.spectron.client.leftClick(selector, xoffset, yoffset);
	}

	async rightClick(selector: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.rightClick(selector);
	}

	async moveToObject(selector: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.moveToObject(selector);
	}

	async waitAndMoveToObject(selector: string): Promise<any> {
		return this.waitFor(() => this.spectron.client.moveToObject(selector), void 0, `move to object with selector ${selector}`);
	}

	async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.setValue(selector, text);
	}

	async waitForElements(selector: string, accept: (result: Element[]) => boolean = result => result.length > 0): Promise<Element[]> {
		return this.waitFor<RawResult<Element[]>>(() => this.spectron.client.elements(selector), result => accept(result.value), `elements with selector ${selector}`)
			.then(result => result.value);
	}

	async waitForElement(selector: string, accept: (result: Element | undefined) => boolean = result => !!result): Promise<Element> {
		return this.waitFor<RawResult<Element>>(() => this.spectron.client.element(selector), result => accept(result ? result.value : void 0), `element with selector ${selector}`)
			.then(result => result.value);
	}

	async waitForVisibility(selector: string, accept: (result: boolean) => boolean = result => result): Promise<any> {
		return this.waitFor(() => this.spectron.client.isVisible(selector), accept, `isVisible with selector ${selector}`);
	}

	async element(selector: string): Promise<Element> {
		return this.spectron.client.element(selector)
			.then(result => result.value);
	}

	async waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(
			() => this.spectron.client.execute(s => document.activeElement.matches(s), selector),
			r => r.value,
			`wait for active element: ${selector}`
		);
	}

	async waitForAttribute(selector: string, attribute: string, accept: (result: string) => boolean = result => !!result): Promise<string> {
		return this.waitFor<string>(() => this.spectron.client.getAttribute(selector), accept, `attribute with selector ${selector}`);
	}

	async dragAndDrop(sourceElem: string, destinationElem: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.dragAndDrop(sourceElem, destinationElem);
	}

	async selectByValue(selector: string, value: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.selectByValue(selector, value);
	}

	async getValue(selector: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.getValue(selector);
	}

	async getAttribute(selector: string, attribute: string, capture: boolean = true): Promise<any> {
		return Promise.resolve(this.spectron.client.getAttribute(selector, attribute));
	}

	buttonDown(): any {
		return this.spectron.client.buttonDown();
	}

	buttonUp(): any {
		return this.spectron.client.buttonUp();
	}

	async isVisible(selector: string, capture: boolean = true): Promise<any> {
		return this.spectron.client.isVisible(selector);
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

	// type(text: string): Promise<any> {
	// 	return new Promise((res) => {
	// 		let textSplit = text.split(' ');

	// 		const type = async (i: number) => {
	// 			if (!textSplit[i] || textSplit[i].length <= 0) {
	// 				return res();
	// 			}

	// 			const toType = textSplit[i + 1] ? `${textSplit[i]} ` : textSplit[i];
	// 			await this.keys(toType);
	// 			await this.keys(['NULL']);
	// 			await type(i + 1);
	// 		};

	// 		return type(0);
	// 	});
	// }
}