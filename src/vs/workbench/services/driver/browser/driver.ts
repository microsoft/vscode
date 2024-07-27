/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getClientArea, getTopLeftOffset } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { coalesce } from 'vs/base/common/arrays';
import { language, locale } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import localizedStrings from 'vs/platform/languagePacks/common/localizedStrings';
import { ILogFile, getLogs } from 'vs/platform/log/browser/log';
import { ILogService } from 'vs/platform/log/common/log';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IWindowDriver, IElement, ILocaleInfo, ILocalizedStrings } from 'vs/workbench/services/driver/common/driver';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import type { Terminal as XtermTerminal } from '@xterm/xterm';

export class BrowserWindowDriver implements IWindowDriver {

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService
	) {
	}

	async getLogs(): Promise<ILogFile[]> {
		return getLogs(this.fileService, this.environmentService);
	}

	async whenWorkbenchRestored(): Promise<void> {
		this.logService.info('[driver] Waiting for restored lifecycle phase...');
		await this.lifecycleService.when(LifecyclePhase.Restored);
		this.logService.info('[driver] Restored lifecycle phase reached. Waiting for contributions...');
		await Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).whenRestored;
		this.logService.info('[driver] Workbench contributions created.');
	}

	async setValue(selector: string, text: string): Promise<void> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			return Promise.reject(new Error(`Element not found: ${selector}`));
		}

		const inputElement = element as HTMLInputElement;
		inputElement.value = text;

		const event = new Event('input', { bubbles: true, cancelable: true });
		inputElement.dispatchEvent(event);
	}

	async isActiveElement(selector: string): Promise<boolean> {
		const element = mainWindow.document.querySelector(selector);

		if (element !== mainWindow.document.activeElement) {
			const chain: string[] = [];
			let el = mainWindow.document.activeElement;

			while (el) {
				const tagName = el.tagName;
				const id = el.id ? `#${el.id}` : '';
				const classes = coalesce(el.className.split(/\s+/g).map(c => c.trim())).map(c => `.${c}`).join('');
				chain.unshift(`${tagName}${id}${classes}`);

				el = el.parentElement;
			}

			throw new Error(`Active element not found. Current active element is '${chain.join(' > ')}'. Looking for ${selector}`);
		}

		return true;
	}

	async getElements(selector: string, recursive: boolean): Promise<IElement[]> {
		const query = mainWindow.document.querySelectorAll(selector);
		const result: IElement[] = [];
		for (let i = 0; i < query.length; i++) {
			const element = query.item(i);
			result.push(this.serializeElement(element, recursive));
		}

		return result;
	}

	private serializeElement(element: Element, recursive: boolean): IElement {
		const attributes = Object.create(null);

		for (let j = 0; j < element.attributes.length; j++) {
			const attr = element.attributes.item(j);
			if (attr) {
				attributes[attr.name] = attr.value;
			}
		}

		const children: IElement[] = [];

		if (recursive) {
			for (let i = 0; i < element.children.length; i++) {
				const child = element.children.item(i);
				if (child) {
					children.push(this.serializeElement(child, true));
				}
			}
		}

		const { left, top } = getTopLeftOffset(element as HTMLElement);

		return {
			tagName: element.tagName,
			className: element.className,
			textContent: element.textContent || '',
			attributes,
			children,
			left,
			top
		};
	}

	async getElementXY(selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number }> {
		const offset = typeof xoffset === 'number' && typeof yoffset === 'number' ? { x: xoffset, y: yoffset } : undefined;
		return this._getElementXY(selector, offset);
	}

	async typeInEditor(selector: string, text: string): Promise<void> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			throw new Error(`Editor not found: ${selector}`);
		}

		const textarea = element as HTMLTextAreaElement;
		const start = textarea.selectionStart;
		const newStart = start + text.length;
		const value = textarea.value;
		const newValue = value.substr(0, start) + text + value.substr(start);

		textarea.value = newValue;
		textarea.setSelectionRange(newStart, newStart);

		const event = new Event('input', { 'bubbles': true, 'cancelable': true });
		textarea.dispatchEvent(event);
	}

	async getTerminalBuffer(selector: string): Promise<string[]> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			throw new Error(`Terminal not found: ${selector}`);
		}

		const xterm = (element as any).xterm;

		if (!xterm) {
			throw new Error(`Xterm not found: ${selector}`);
		}

		const lines: string[] = [];
		for (let i = 0; i < xterm.buffer.active.length; i++) {
			lines.push(xterm.buffer.active.getLine(i)!.translateToString(true));
		}

		return lines;
	}

	async writeInTerminal(selector: string, text: string): Promise<void> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			throw new Error(`Element not found: ${selector}`);
		}

		const xterm = (element as any).xterm as (XtermTerminal | undefined);

		if (!xterm) {
			throw new Error(`Xterm not found: ${selector}`);
		}

		xterm.input(text);
	}

	getLocaleInfo(): Promise<ILocaleInfo> {
		return Promise.resolve({
			language: language,
			locale: locale
		});
	}

	getLocalizedStrings(): Promise<ILocalizedStrings> {
		return Promise.resolve({
			open: localizedStrings.open,
			close: localizedStrings.close,
			find: localizedStrings.find
		});
	}

	protected async _getElementXY(selector: string, offset?: { x: number; y: number }): Promise<{ x: number; y: number }> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			return Promise.reject(new Error(`Element not found: ${selector}`));
		}

		const { left, top } = getTopLeftOffset(element as HTMLElement);
		const { width, height } = getClientArea(element as HTMLElement);
		let x: number, y: number;

		if (offset) {
			x = left + offset.x;
			y = top + offset.y;
		} else {
			x = left + (width / 2);
			y = top + (height / 2);
		}

		x = Math.round(x);
		y = Math.round(y);

		return { x, y };
	}

	async exitApplication(): Promise<void> {
		// No-op in web
	}

}

export function registerWindowDriver(instantiationService: IInstantiationService): void {
	Object.assign(mainWindow, { driver: instantiationService.createInstance(BrowserWindowDriver) });
}
