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
}

export class SpectronDriver implements Driver {

	constructor(private spectronClient: SpectronClient) { }

	keys(keys: string[]): Promise<void> {
		this.spectronClient.keys(keys);
		return Promise.resolve();
	}

	async click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void> {
		await this.spectronClient.leftClick(selector, xoffset, yoffset);
	}

	async doubleClick(selector: string): Promise<void> {
		await this.spectronClient.doubleClick(selector);
	}

	async move(selector: string): Promise<void> {
		await this.spectronClient.moveToObject(selector);
	}

	async setValue(selector: string, text: string): Promise<void> {
		await this.spectronClient.setValue(selector, text);
	}

	async getTitle(): Promise<string> {
		return await this.spectronClient.getTitle();
	}

	async isActiveElement(selector: string): Promise<boolean> {
		const result = await (this.spectronClient.execute(s => document.activeElement.matches(s), selector) as any as Promise<{ value: boolean; }>);
		return result.value;
	}

	async getElements(selector: string): Promise<APIElement[]> {
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
}

export class API {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 100; // in milliseconds
	private driver: Driver;

	constructor(
		private spectronClient: SpectronClient,
		private screenCapturer: ScreenCapturer,
		waitTime: number
	) {
		this.driver = new SpectronDriver(spectronClient);
		this.retryCount = (waitTime * 1000) / this.retryDuration;
	}

	keys(keys: string[]): Promise<void> {
		return this.driver.keys(keys);
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
		accept = accept ? accept : (result => textContent !== void 0 ? textContent === result : !!result);
		return this.waitFor(() => this.driver.getElements(selector).then(els => els[0].textContent), s => accept!(typeof s === 'string' ? s : ''), `getTextContent with selector ${selector}`);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number): Promise<any> {
		return this.waitFor(() => this.driver.click(selector, xoffset, yoffset), () => true, `click with selector ${selector}`);
	}

	async waitAndDoubleClick(selector: string, capture: boolean = true): Promise<any> {
		return this.waitFor(() => this.driver.doubleClick(selector), () => true, `doubleClick with selector ${selector}`);
	}

	async waitAndMove(selector: string): Promise<any> {
		return this.waitFor(() => this.driver.move(selector), () => true, `move to object with selector ${selector}`);
	}

	async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
		return this.driver.setValue(selector, text);
	}

	async doesElementExist(selector: string): Promise<boolean> {
		const elements = await this.driver.getElements(selector);
		return elements.length > 0;
	}

	async getElementCount(selector: string): Promise<number> {
		const elements = await this.driver.getElements(selector);
		return elements.length;
	}

	async waitForElements(selector: string, accept: (result: APIElement[]) => boolean = result => result.length > 0): Promise<APIElement[]> {
		return this.waitFor(() => this.driver.getElements(selector), accept, `elements with selector ${selector}`) as Promise<any>;
	}

	async waitForElement(selector: string, accept: (result: APIElement | undefined) => boolean = result => !!result): Promise<void> {
		return this.waitFor(() => this.driver.getElements(selector).then(els => els[0]), accept, `element with selector ${selector}`) as Promise<any>;
	}

	async waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(() => this.driver.isActiveElement(selector), undefined, `wait for active element: ${selector}`);
	}

	async getTitle(): Promise<string> {
		return this.driver.getTitle();
	}

	selectorExecute<P>(
		selectors: string | string[],
		script: (elements: HTMLElement | HTMLElement[], ...args: any[]) => P,
		...args: any[]
	): Promise<P> {
		return this.spectronClient.selectorExecute(selectors, script, ...args);
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