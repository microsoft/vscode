/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronClient } from 'spectron';
import { RawResult, Element } from 'webdriverio';
import { ScreenCapturer } from '../helpers/screenshot';

export interface APIElement {
	tagName: string;
	className: string;
	textContent: string;
}

export class API {

	// waitFor calls should not take more than 200 * 100 = 20 seconds to complete, excluding
	// the time it takes for the actual retry call to complete
	private retryCount: number;
	private readonly retryDuration = 100; // in milliseconds

	constructor(
		private spectronClient: SpectronClient,
		private screenCapturer: ScreenCapturer,
		waitTime: number
	) {
		this.retryCount = (waitTime * 1000) / this.retryDuration;
	}

	keys(keys: string[]): Promise<void> {
		this.spectronClient.keys(keys);
		return Promise.resolve();
	}

	async waitForTextContent(selector: string, textContent?: string, accept?: (result: string) => boolean): Promise<string> {
		accept = accept ? accept : (result => textContent !== void 0 ? textContent === result : !!result);
		const fn = async () => await this.spectronClient.selectorExecute(selector, div => Array.isArray(div) ? div[0].textContent : div.textContent);
		return this.waitFor(fn, s => accept!(typeof s === 'string' ? s : ''), `getTextContent with selector ${selector}`);
	}

	async waitAndClick(selector: string, xoffset?: number, yoffset?: number): Promise<any> {
		return this.waitFor(() => this.spectronClient.leftClick(selector, xoffset, yoffset), void 0, `click with selector ${selector}`);
	}

	async waitAndDoubleClick(selector: string, capture: boolean = true): Promise<any> {
		return this.waitFor(() => this.spectronClient.doubleClick(selector), void 0, `doubleClick with selector ${selector}`);
	}

	async waitAndMoveToObject(selector: string): Promise<any> {
		return this.waitFor(() => this.spectronClient.moveToObject(selector), void 0, `move to object with selector ${selector}`);
	}

	async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
		return this.spectronClient.setValue(selector, text);
	}

	async doesElementExist(selector: string): Promise<boolean> {
		return this.spectronClient.element(selector).then(result => !!result.value);
	}

	async getElementCount(selector: string): Promise<number> {
		const result = await this.spectronClient.elements(selector);
		return result.value.length;
	}

	async waitForElements(selector: string, accept: (result: APIElement[]) => boolean = result => result.length > 0): Promise<APIElement[]> {
		const _fn: any = () => {
			return this.spectronClient.execute(selector => {
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
			}, selector)
				.then(result => result.value);
		};

		return this.waitFor(_fn, accept, `elements with selector ${selector}`) as Promise<any>;
	}

	async waitForElement(selector: string, accept: (result: Element | undefined) => boolean = result => !!result): Promise<void> {
		return this.waitFor<RawResult<Element>>(() => this.spectronClient.element(selector), result => accept(result ? result.value : void 0), `element with selector ${selector}`) as Promise<any>;
	}

	async waitForActiveElement(selector: string): Promise<any> {
		return this.waitFor(
			() => this.spectronClient.execute(s => document.activeElement.matches(s), selector),
			r => r.value,
			`wait for active element: ${selector}`
		);
	}

	async getTitle(): Promise<string> {
		return this.spectronClient.getTitle();
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