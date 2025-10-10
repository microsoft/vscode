/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getClientArea, getTopLeftOffset, isHTMLDivElement, isHTMLTextAreaElement } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { language, locale } from '../../../../base/common/platform.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import localizedStrings from '../../../../platform/languagePacks/common/localizedStrings.js';
import { ILogFile, getLogs } from '../../../../platform/log/browser/log.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IWindowDriver, IElement, ILocaleInfo, ILocalizedStrings } from '../common/driver.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
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
		if (isHTMLDivElement(element)) {
			// Edit context is enabled
			const editContext = element.editContext;
			if (!editContext) {
				throw new Error(`Edit context not found: ${selector}`);
			}
			const selectionStart = editContext.selectionStart;
			const selectionEnd = editContext.selectionEnd;
			const event = new TextUpdateEvent('textupdate', {
				updateRangeStart: selectionStart,
				updateRangeEnd: selectionEnd,
				text,
				selectionStart: selectionStart + text.length,
				selectionEnd: selectionStart + text.length,
				compositionStart: 0,
				compositionEnd: 0
			});
			editContext.dispatchEvent(event);
		} else if (isHTMLTextAreaElement(element)) {
			const start = element.selectionStart;
			const newStart = start + text.length;
			const value = element.value;
			const newValue = value.substr(0, start) + text + value.substr(start);

			element.value = newValue;
			element.setSelectionRange(newStart, newStart);

			const event = new Event('input', { 'bubbles': true, 'cancelable': true });
			element.dispatchEvent(event);
		}
	}

	async getEditorSelection(selector: string): Promise<{ selectionStart: number; selectionEnd: number }> {
		const element = mainWindow.document.querySelector(selector);
		if (!element) {
			throw new Error(`Editor not found: ${selector}`);
		}
		if (isHTMLDivElement(element)) {
			const editContext = element.editContext;
			if (!editContext) {
				throw new Error(`Edit context not found: ${selector}`);
			}
			return { selectionStart: editContext.selectionStart, selectionEnd: editContext.selectionEnd };
		} else if (isHTMLTextAreaElement(element)) {
			return { selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
		} else {
			throw new Error(`Unknown type of element: ${selector}`);
		}
	}

	async getTerminalBuffer(selector: string): Promise<string[]> {
		const element = mainWindow.document.querySelector(selector);

		if (!element) {
			throw new Error(`Terminal not found: ${selector}`);
		}

		// eslint-disable-next-line local/code-no-any-casts
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

		// eslint-disable-next-line local/code-no-any-casts
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
}

export function registerWindowDriver(instantiationService: IInstantiationService): void {
	Object.assign(mainWindow, { driver: instantiationService.createInstance(BrowserWindowDriver) });
}
