/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const puppeteer = require('puppeteer');

// export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>

const width = 800;
const height = 600;

function buildDriver(browser, page) {
	return {
		_serviceBrand: undefined,
		getWindowIds: () => {
			return Promise.resolve([1]);
		},
		capturePage: () => Promise.result(''),
		reloadWindow: (windowId) => Promise.resolve(),
		exitApplication: () => browser.close(),
		dispatchKeybinding: async (windowId, keybinding) => {
			console.log('ctrl+p');
			await page.keyboard.down('Control');
			await page.keyboard.press('p');
			await page.keyboard.up('Control');
			await page.waitForSelector('.jkasndknjadsf');
		},
		click: (windowId, selector, xoffset, yoffset) => Promise.resolve(),
		doubleClick: (windowId, selector) => Promise.resolve(),
		setValue: (windowId, selector, text) => Promise.resolve(),
		getTitle: (windowId) => page.title(),
		isActiveElement: (windowId, selector) => {
			page.evaluate(`document.querySelector('${selector}') === document.activeElement`);
		},
		getElements: async (windowId, selector, recursive) => {
			return await page.evaluate(`
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
		getTerminalBuffer: async (windowId, selector) => {
			return await page.evaluate(`
				(function () {
					const element = document.querySelector(selector);

					if (!element) {
						throw new Error('Terminal not found: ${selector}'');
					}

					const xterm: Terminal = element.xterm;

					if (!xterm) {
						throw new Error('Xterm not found: ${selector}');
					}

					const lines: string[] = [];

					for (let i = 0; i < xterm.buffer.length; i++) {
						lines.push(xterm.buffer.getLine(i).translateToString(true));
					}

					return lines;
				})();
			`);
		},
		writeInTerminal: async (windowId, selector, text) => {
			page.evaluate(`
				const element = document.querySelector(selector);

				if (!element) {
					throw new Error('Element not found: ${selector}');
				}

				const xterm: Terminal = element.xterm;

				if (!xterm) {
					throw new Error('Xterm not found: ${selector}');
				}

				xterm._core.handler(text);
			`);
		}
	}
}

exports.connect = function (outPath, handle) {
	return new Promise(async (c) => {
		const browser = await puppeteer.launch({
			headless: false,
			slowMo: 80,
			args: [`--window-size=${width},${height}`]
		});
		const page = (await browser.pages())[0];
		await page.setViewport({ width, height });
		await page.goto('http://127.0.0.1:8000');
		const result = {
			client: { dispose: () => {} },
			driver: buildDriver(browser, page)
		}
		c(result);
	});
};
