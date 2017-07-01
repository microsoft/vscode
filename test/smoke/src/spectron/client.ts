/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application } from 'spectron';
import { Screenshot } from '../helpers/screenshot';

/**
 * Abstracts the Spectron's WebdriverIO managed client property on the created Application instances.
 */
export class SpectronClient {

	constructor(private spectron: Application, private shot: Screenshot) {
		// noop
	}

	public windowByIndex(index: number): Promise<any> {
		return this.spectron.client.windowByIndex(index);
	}

	public async keys(keys: string[] | string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.keys(keys);
	}

	public async getText(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.getText(selector);
	}

	public async getHTML(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.getHTML(selector);
	}

	public async click(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.click(selector);
	}

	public async doubleClick(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.doubleClick(selector);
	}

	public async leftClick(selector: string, xoffset: number, yoffset: number, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.leftClick(selector, xoffset, yoffset);
	}

	public async rightClick(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.rightClick(selector);
	}

	public async moveToObject(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.moveToObject(selector);
	}

	public async setValue(selector: string, text: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.setValue(selector, text);
	}

	public async elements(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.elements(selector);
	}

	public async element(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.element(selector);
	}

	public async dragAndDrop(sourceElem: string, destinationElem: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.dragAndDrop(sourceElem, destinationElem);
	}

	public async selectByValue(selector: string, value: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.selectByValue(selector, value);
	}

	public async getValue(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.getValue(selector);
	}

	public async getAttribute(selector: string, attribute: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return Promise.resolve(this.spectron.client.getAttribute(selector, attribute));
	}

	public clearElement(selector: string): any {
		return this.spectron.client.clearElement(selector);
	}

	public buttonDown(): any {
		return this.spectron.client.buttonDown();
	}

	public buttonUp(): any {
		return this.spectron.client.buttonUp();
	}

	public async isVisible(selector: string, capture: boolean = true): Promise<any> {
		await this.screenshot(capture);
		return this.spectron.client.isVisible(selector);
	}

	public getTitle(): string {
		return this.spectron.client.getTitle();
	}

	private async screenshot(capture: boolean): Promise<any> {
		if (capture) {
			try {
				await this.shot.capture();
			} catch (e) {
				throw new Error(`Screenshot could not be captured: ${e}`);
			}
		}
	}
}