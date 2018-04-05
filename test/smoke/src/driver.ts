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
	keys(keys: string[]): Promise<void>;
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

	constructor(driver: IDriver) { }

	keys(keys: string[]): Promise<void> {
		throw new Error('Method not implemented.');
	}
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<any> {
		throw new Error('Method not implemented.');
	}
	doubleClick(selector: string): Promise<any> {
		throw new Error('Method not implemented.');
	}
	move(selector: string): Promise<any> {
		throw new Error('Method not implemented.');
	}
	setValue(selector: string, text: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getTitle(): Promise<string> {
		throw new Error('Method not implemented.');
	}
	isActiveElement(selector: string): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	getElements(selector: string): Promise<Element[]> {
		throw new Error('Method not implemented.');
	}
	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P> {
		throw new Error('Method not implemented.');
	}
}