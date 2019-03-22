/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';

/**
 * @param text The content to stylize.
 * @returns An {@link HTMLSpanElement} that contains the potentially stylized text.
 */
export function handleANSIOutput(text: string, linkDetector: LinkDetector): HTMLSpanElement {

	const root: HTMLSpanElement = document.createElement('span');
	const textLength: number = text.length;

	let styleNames: string[] = [];
	let customFgColor: RGBColor | null = null;
	let customBgColor: RGBColor | null = null;
	let currentPos: number = 0;
	let buffer: string = '';

	while (currentPos < textLength) {

		let sequenceFound: boolean = false;

		// Potentially an ANSI escape sequence.
		// See http://ascii-table.com/ansi-escape-sequences.php & https://en.wikipedia.org/wiki/ANSI_escape_code
		if (text.charCodeAt(currentPos) === 27 && text.charAt(currentPos + 1) === '[') {

			const startPos: number = currentPos;
			currentPos += 2; // Ignore 'Esc[' as it's in every sequence.

			let ansiSequence: string = '';

			while (currentPos < textLength) {
				const char: string = text.charAt(currentPos);
				ansiSequence += char;

				currentPos++;

				// Look for a known sequence terminating character.
				if (char.match(/^[ABCDHIJKfhmpsu]$/)) {
					sequenceFound = true;
					break;
				}

			}

			if (sequenceFound) {

				// Flush buffer with previous styles.
				appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, customFgColor, customBgColor);

				buffer = '';

				/*
				 * Certain ranges that are matched here do not contain real graphics rendition sequences. For
				 * the sake of having a simpler expression, they have been included anyway.
				 */
				if (ansiSequence.match(/^(?:[34][0-8]|9[0-7]|10[0-7]|[013]|4|[34]9)(?:;[349][0-7]|10[0-7]|[013]|[245]|[34]9)?(?:;[012]?[0-9]?[0-9])*;?m$/)) {

					const styleCodes: number[] = ansiSequence.slice(0, -1) // Remove final 'm' character.
						.split(';')										   // Separate style codes.
						.filter(elem => elem !== '')			           // Filter empty elems as '34;m' -> ['34', ''].
						.map(elem => parseInt(elem, 10));		           // Convert to numbers.

					if (styleCodes[0] === 38 || styleCodes[0] === 48) {
						// Advanced color code - can't be combined with formatting codes like simple colors can
						// Ignores invalid colors and additional info beyond what is necessary
						const isForeground: boolean = (styleCodes[0] === 38);

						if (styleCodes[1] === 5) {
							calcAndSet8BitColor(styleCodes, isForeground);
						} else if (styleCodes[1] === 2) {
							calcAndSet24BitColor(styleCodes, isForeground);
						}
					} else {
						calcAndSetBasicFormatters(styleCodes);
					}

				} else {
					// Unsupported sequence so simply hide it.
				}

			} else {
				currentPos = startPos;
			}
		}

		if (sequenceFound === false) {
			buffer += text.charAt(currentPos);
			currentPos++;
		}
	}

	// Flush remaining text buffer if not empty.
	if (buffer) {
		appendStylizedStringToContainer(root, buffer, styleNames, linkDetector, customFgColor, customBgColor);
	}

	return root;

	/**
	 * Change the foreground or background color by clearing the current color
	 * and adding the new one.
	 * @param newClass If string or number, new class will be
	 *  `code-(foreground or background)-newClass`. If `null`, no new class
	 * 	will be added.
	 * @param isForeground If `true`, will change the foreground color, if
	 * 	`false`, will change the background color.
	 * @param customColor If provided, this custom color will be used instead of
	 * 	a class-defined color.
	 */
	function changeColor(newClass: string | number | null, isForeground: boolean, customColor?: RGBColor | null): void {
		const colorType = isForeground ? 'foreground' : 'background';
		styleNames = styleNames.filter(style => !style.match(new RegExp(`^code-${colorType}-(\\d+|custom)$`)));
		if (newClass) {
			styleNames.push(`code-${colorType}-${newClass}`);
		}
		if (isForeground) {
			customFgColor = customColor || null;
		} else {
			customBgColor = customColor || null;
		}
	}

	/**
	 * Calculate and set basic ANSI formatting. Supports bold, italic, underline,
	 * normal foreground and background colors, and bright foreground and
	 * background colors. Not to be used for codes containing advanced colors.
	 * Will ignore invalid codes.
	 * @param styleCodes Array of ANSI basic styling numbers, which will be
	 * applied in order. New colors and backgrounds clear old ones; new formatting
	 * does not.
	 * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code }
	 */
	function calcAndSetBasicFormatters(styleCodes: number[]): void {
		for (let code of styleCodes) {
			if (code === 0) {
				styleNames = [];
			} else if (code === 1) {
				styleNames.push('code-bold');
			} else if (code === 3) {
				styleNames.push('code-italic');
			} else if (code === 4) {
				styleNames.push('code-underline');
			} else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
				changeColor(code, true);
			} else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
				changeColor(code, false);
			} else if (code === 39) {
				changeColor(null, true);
			} else if (code === 49) {
				changeColor(null, false);
			}
		}
	}

	/**
	 * Calculate and set styling for complicated 24-bit ANSI color codes.
	 * @param styleCodes Full list of integer codes that make up the full ANSI
	 * sequence, including the two defining codes and the three RGB codes.
	 * @param isForeground If `true`, will set foreground color, if `false`, will
	 * set background color.
	 * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code#24-bit }
	 */
	function calcAndSet24BitColor(styleCodes: number[], isForeground: boolean): void {
		if (styleCodes.length >= 5 &&
			styleCodes[2] >= 0 && styleCodes[2] <= 255 &&
			styleCodes[3] >= 0 && styleCodes[3] <= 255 &&
			styleCodes[4] >= 0 && styleCodes[4] <= 255) {
			const customColor = new RGBColor(styleCodes[2], styleCodes[3], styleCodes[4]);
			changeColor('custom', isForeground, customColor);
		}
	}

	/**
	 * Calculate and set styling for advanced 8-bit ANSI color codes.
	 * @param styleCodes Full list of integer codes that make up the ANSI
	 * sequence, including the two defining codes and the one color code.
	 * @param isForeground If `true`, will set foreground color, if `false`, will
	 * set background color.
	 * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit }
	 */
	function calcAndSet8BitColor(styleCodes: number[], isForeground: boolean): void {
		let colorNumber = styleCodes[2];
		const color = calcANSI8bitColor(colorNumber);

		if (color) {
			changeColor('custom', isForeground, color);
		} else if (colorNumber >= 0 && colorNumber <= 15) {
			// Need to map to one of the four basic color ranges (30-37, 90-97, 40-47, 100-107)
			colorNumber += 30;
			if (colorNumber >= 38) {
				// Bright colors
				colorNumber += 52;
			}
			if (!isForeground) {
				colorNumber += 10;
			}
			changeColor(colorNumber, isForeground);
		}
	}
}

/**
 * @param root The {@link HTMLElement} to append the content to.
 * @param stringContent The text content to be appended.
 * @param cssClasses The list of CSS styles to apply to the text content.
 * @param linkDetector The {@link LinkDetector} responsible for generating links from {@param stringContent}.
 */
export function appendStylizedStringToContainer(
	root: HTMLElement,
	stringContent: string,
	cssClasses: string[],
	linkDetector: LinkDetector,
	customTextColor?: RGBColor | null,
	customBackgroundColor?: RGBColor | null
): void {
	if (!root || !stringContent) {
		return;
	}

	const container = linkDetector.handleLinks(stringContent);

	container.className = cssClasses.join(' ');
	if (customTextColor) {
		container.style.color = customTextColor.asCSSString;
	}
	if (customBackgroundColor) {
		container.style.backgroundColor = customBackgroundColor.asCSSString;
	}

	root.appendChild(container);
}

/**
 * Class representing a color defined with RGB values.
 */
export class RGBColor {
	/** Red level from 0 to 255. */
	r: number;
	/** Green level from 0 to 255. */
	g: number;
	/** Blue level from 0 to 255. */
	b: number;

	/**
	 * Construct a new RGBColor.
	 * @param r Red level from 0 to 255.
	 * @param g Green level from 0 to 255.
	 * @param b Blue level from 0 to 255.
	 */
	constructor(r: number, g: number, b: number) {
		this.r = r;
		this.g = g;
		this.b = b;
	}

	/**
	 * Get the color as a string for use in CSS rules.
	 */
	get asCSSString(): string {
		return `rgb(${this.r}, ${this.g}, ${this.b})`;
	}
}

/**
 * Calculate the color from the color set defined in the ANSI 8-bit standard.
 * Standard and high intensity colors are not defined in the standard as specific
 * colors, so these and invalid colors are returned as `null`.
 * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code#8-bit } for info.
 * @param colorNumber The number (ranging from 16 to 255) referring to the color
 * desired.
 */
export function calcANSI8bitColor(colorNumber: number): RGBColor | null {
	if (colorNumber % 1 !== 0) {
		// Should be integer
		return null;
	} if (colorNumber >= 16 && colorNumber <= 231) {
		// Converts to one of 216 RGB colors
		colorNumber -= 16;

		let blue: number = colorNumber % 6;
		colorNumber = (colorNumber - blue) / 6;
		let green: number = colorNumber % 6;
		colorNumber = (colorNumber - green) / 6;
		let red: number = colorNumber;

		// red, green, blue now range on [0, 5], need to map to [0,255]
		const convFactor: number = 255 / 5;
		blue = Math.round(blue * convFactor);
		green = Math.round(green * convFactor);
		red = Math.round(red * convFactor);

		return new RGBColor(red, green, blue);
	} else if (colorNumber >= 232 && colorNumber <= 255) {
		// Converts to a grayscale value
		colorNumber -= 232;
		const colorLevel: number = Math.round(colorNumber / 23 * 255);
		return new RGBColor(colorLevel, colorLevel, colorLevel);
	} else {
		return null;
	}
}