/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronClient } from 'spectron';
import { ScreenCapturer } from '../helpers/screenshot';

export interface APIElement {
	tagName: string;
	className: string;
	textContent: string;
}

export interface Driver {
	keys(keys: string[]): Promise<void>;
	click(selector: string, xoffset?: number, yoffset?: number): Promise<any>;
	doubleClick(selector: string): Promise<any>;
	move(selector: string): Promise<any>;
	setValue(selector: string, text: string): Promise<void>;
	getTitle(): Promise<string>;

	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string): Promise<APIElement[]>;
	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P>;
}

export class SpectronDriver implements Driver {

	constructor(
		private spectronClient: SpectronClient,
		private verbose: boolean
	) { }

	keys(keys: string[]): Promise<void> {
		if (this.verbose) {
			console.log('- keys:', keys);
		}

		this.spectronClient.keys(keys);
		return Promise.resolve();
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

	async getElements(selector: string): Promise<APIElement[]> {
		if (this.verbose) {
			console.log('- getElements:', selector);
		}

		const result = await (this.spectronClient.execute(selector => {
			const query = document.querySelectorAll(selector);
			const result: APIElement[] = [];

			for (let i = 0; i < query.length; i++) {
				const element: HTMLElement = query.item(i);

				result.push({
					tagName: element.tagName,
					className: element.className,
					textContent: element.textContent || ''
				});
			}

			return result;
		}, selector) as any as Promise<{ value: APIElement[]; }>);

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

export class API {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 100; // in milliseconds
	private driver: Driver;

	constructor(
		spectronClient: SpectronClient,
		private screenCapturer: ScreenCapturer,
		waitTime: number,
		verbose: boolean
	) {
		this.driver = new SpectronDriver(spectronClient, verbose);
		this.retryCount = (waitTime * 1000) / this.retryDuration;
	}

	keys(keys: string[]): Promise<void> {
		return this.driver.keys(keys);
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

	waitForElements(selector: string, accept: (result: APIElement[]) => boolean = result => result.length > 0): Promise<APIElement[]> {
		return this.waitFor(() => this.driver.getElements(selector), accept, `elements with selector ${selector}`) as Promise<any>;
	}

	waitForElement(selector: string, accept: (result: APIElement | undefined) => boolean = result => !!result): Promise<void> {
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