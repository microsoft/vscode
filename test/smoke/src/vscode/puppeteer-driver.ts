/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const puppeteer = require('puppeteer');

// export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>

const width = 1200;
const height = 800;

const vscodeToPuppeteerKey = {
	cmd: 'Meta',
	ctrl: 'Control',
	enter: 'Enter'
};

function buildDriver(browser, page) {
	return {
		_serviceBrand: undefined,
		getWindowIds: () => {
			return Promise.resolve([1]);
		},
		capturePage: () => Promise.resolve(''),
		reloadWindow: (windowId) => Promise.resolve(),
		exitApplication: () => browser.close(),
		dispatchKeybinding: async (windowId, keybinding) => {
			const keys = keybinding.split('+');
			const keysDown: string[] = [];
			for (let i = 0; i < keys.length; i++) {
				if (keys[i] in vscodeToPuppeteerKey) {
					keys[i] = vscodeToPuppeteerKey[keys[i]];
				}
				await page.keyboard.down(keys[i]);
				keysDown.push(keys[i]);
			}
			while (keysDown.length > 0) {
				await page.keyboard.up(keysDown.pop());
			}
		},
		click: async (windowId, selector, xoffset, yoffset) => {
			console.log('click');
			const { x, y } = await page.evaluate(`
				(function() {
					function convertToPixels(element, value) {
						return parseFloat(value) || 0;
					}
					function getDimension(element, cssPropertyName, jsPropertyName) {
						let computedStyle = getComputedStyle(element);
						let value = '0';
						if (computedStyle) {
							if (computedStyle.getPropertyValue) {
								value = computedStyle.getPropertyValue(cssPropertyName);
							} else {
								// IE8
								value = (computedStyle).getAttribute(jsPropertyName);
							}
						}
						return convertToPixels(element, value);
					}
					function getBorderLeftWidth(element) {
						return getDimension(element, 'border-left-width', 'borderLeftWidth');
					}
					function getBorderRightWidth(element) {
						return getDimension(element, 'border-right-width', 'borderRightWidth');
					}
					function getBorderTopWidth(element) {
						return getDimension(element, 'border-top-width', 'borderTopWidth');
					}
					function getBorderBottomWidth(element) {
						return getDimension(element, 'border-bottom-width', 'borderBottomWidth');
					}
					function getClientArea(element) {
						// Try with DOM clientWidth / clientHeight
						if (element !== document.body) {
							return { width: element.clientWidth, height: element.clientHeight };
						}

						// Try innerWidth / innerHeight
						if (window.innerWidth && window.innerHeight) {
							return { width: window.innerWidth, height: window.innerHeight };
						}

						// Try with document.body.clientWidth / document.body.clientHeight
						if (document.body && document.body.clientWidth && document.body.clientHeight) {
							return { width: document.body.clientWidth, height: document.body.clientHeight };
						}

						// Try with document.documentElement.clientWidth / document.documentElement.clientHeight
						if (document.documentElement && document.documentElement.clientWidth && document.documentElement.clientHeight) {
							return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
						}

						throw new Error('Unable to figure out browser width and height');
					}
					function getTopLeftOffset(element) {
						// Adapted from WinJS.Utilities.getPosition
						// and added borders to the mix

						let offsetParent = element.offsetParent, top = element.offsetTop, left = element.offsetLeft;

						while ((element = element.parentNode) !== null && element !== document.body && element !== document.documentElement) {
							top -= element.scrollTop;
							let c = getComputedStyle(element);
							if (c) {
								left -= c.direction !== 'rtl' ? element.scrollLeft : -element.scrollLeft;
							}

							if (element === offsetParent) {
								left += getBorderLeftWidth(element);
								top += getBorderTopWidth(element);
								top += element.offsetTop;
								left += element.offsetLeft;
								offsetParent = element.offsetParent;
							}
						}

						return {
							left: left,
							top: top
						};
					}
					const element = document.querySelector('${selector}');

					if (!element) {
						throw new Error('Element not found: ${selector}');
					}

					const { left, top } = getTopLeftOffset(element);
					const { width, height } = getClientArea(element);
					let x, y;

					x = left + (width / 2);
					y = top + (height / 2);

					x = Math.round(x);
					y = Math.round(y);

					return { x, y };
				})();
			`);
			await page.mouse.click(x + (xoffset ? xoffset : 0), y + (yoffset ? yoffset : 0));
		},
		doubleClick: (windowId, selector) => Promise.resolve(),
		setValue: async (windowId, selector, text) => {
			return page.evaluate(`
				(function() {
					const element = document.querySelector('${selector}');

					if (!element) {
						throw new Error('Element not found: ${selector}');
					}

					const inputElement = element;
					inputElement.value = '${text}';

					const event = new Event('input', { bubbles: true, cancelable: true });
					inputElement.dispatchEvent(event);
					return true;
				})();
			`);
		},
		getTitle: (windowId) => page.title(),
		isActiveElement: (windowId, selector) => {
			return page.evaluate(`document.querySelector('${selector}') === document.activeElement`);
		},
		getElements: (windowId, selector, recursive) => {
			return page.evaluate(`
				(function() {
					function convertToPixels(element, value) {
						return parseFloat(value) || 0;
					}
					function getDimension(element, cssPropertyName, jsPropertyName) {
						let computedStyle = getComputedStyle(element);
						let value = '0';
						if (computedStyle) {
							if (computedStyle.getPropertyValue) {
								value = computedStyle.getPropertyValue(cssPropertyName);
							} else {
								// IE8
								value = (computedStyle).getAttribute(jsPropertyName);
							}
						}
						return convertToPixels(element, value);
					}
					function getBorderLeftWidth(element) {
						return getDimension(element, 'border-left-width', 'borderLeftWidth');
					}
					function getBorderRightWidth(element) {
						return getDimension(element, 'border-right-width', 'borderRightWidth');
					}
					function getBorderTopWidth(element) {
						return getDimension(element, 'border-top-width', 'borderTopWidth');
					}
					function getBorderBottomWidth(element) {
						return getDimension(element, 'border-bottom-width', 'borderBottomWidth');
					}
					function getTopLeftOffset(element) {
						// Adapted from WinJS.Utilities.getPosition
						// and added borders to the mix

						let offsetParent = element.offsetParent, top = element.offsetTop, left = element.offsetLeft;

						while ((element = element.parentNode) !== null && element !== document.body && element !== document.documentElement) {
							top -= element.scrollTop;
							let c = getComputedStyle(element);
							if (c) {
								left -= c.direction !== 'rtl' ? element.scrollLeft : -element.scrollLeft;
							}

							if (element === offsetParent) {
								left += getBorderLeftWidth(element);
								top += getBorderTopWidth(element);
								top += element.offsetTop;
								left += element.offsetLeft;
								offsetParent = element.offsetParent;
							}
						}

						return {
							left: left,
							top: top
						};
					}
					function serializeElement(element, recursive) {
						const attributes = Object.create(null);

						for (let j = 0; j < element.attributes.length; j++) {
							const attr = element.attributes.item(j);
							if (attr) {
								attributes[attr.name] = attr.value;
							}
						}

						const children = [];

						if (recursive) {
							for (let i = 0; i < element.children.length; i++) {
								const child = element.children.item(i);
								if (child) {
									children.push(serializeElement(child, true));
								}
							}
						}

						const { left, top } = getTopLeftOffset(element);

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

					const query = document.querySelectorAll('${selector}');
					const result = [];

					for (let i = 0; i < query.length; i++) {
						const element = query.item(i);
						result.push(serializeElement(element, ${recursive}));
					}

					return result;
				})();
			`);
		},
		typeInEditor: (windowId, selector, text) => Promise.resolve(),
		getTerminalBuffer: (windowId, selector) => {
			return page.evaluate(`
				(function () {
					const element = document.querySelector('${selector}');

					if (!element) {
						throw new Error('Terminal not found: ${selector}');
					}

					const xterm = element.xterm;

					if (!xterm) {
						throw new Error('Xterm not found: ${selector}');
					}

					const lines = [];

					for (let i = 0; i < xterm.buffer.length; i++) {
						lines.push(xterm.buffer.getLine(i).translateToString(true));
					}

					return lines;
				})();
			`);
		},
		writeInTerminal: (windowId, selector, text) => {
			return page.evaluate(`
				(function () {
					const element = document.querySelector('${selector}');

					if (!element) {
						throw new Error('Element not found: ${selector}');
					}

					const xterm = element.xterm;

					if (!xterm) {
						throw new Error('Xterm not found: ${selector}');
					}

					xterm._core._coreService.triggerDataEvent('${text}');
				})();
			`);
		}
	};
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }> {
	return new Promise(async (c) => {
		const browser = await puppeteer.launch({
			// Run in Edge dev on macOS
			// executablePath: '/Applications/Microsoft\ Edge\ Dev.app/Contents/MacOS/Microsoft\ Edge\ Dev',
			headless: false,
			slowMo: 80,
			args: [`--window-size=${width},${height}`]
		});
		const page = (await browser.pages())[0];
		await page.setViewport({ width, height });
		await page.goto('http://127.0.0.1:9888');
		const result = {
			client: { dispose: () => { } },
			driver: buildDriver(browser, page)
		};
		c(result);
	});
}

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise library is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommend the use of native promises which are available in this editor.
 */
export interface Thenable<T> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string; };
	children: IElement[];
	top: number;
	left: number;
}

export interface IDriver {
	_serviceBrand: any;

	getWindowIds(): Promise<number[]>;
	capturePage(windowId: number): Promise<string>;
	reloadWindow(windowId: number): Promise<void>;
	exitApplication(): Promise<void>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	doubleClick(windowId: number, selector: string): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<string>;
	isActiveElement(windowId: number, selector: string): Promise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): Promise<IElement[]>;
	typeInEditor(windowId: number, selector: string, text: string): Promise<void>;
	getTerminalBuffer(windowId: number, selector: string): Promise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): Promise<void>;
}

export interface IDisposable {
	dispose(): void;
}