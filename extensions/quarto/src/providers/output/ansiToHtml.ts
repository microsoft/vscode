/*---------------------------------------------------------------------------------------------
 *  Adapted from VS Code's debugANSIHandling.ts
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RGBA } from './color';
import { ansiColorIdentifiers } from './colorMap';

/**
 * Convert ANSI escape sequences to HTML strings
 * @param text The content to convert
 * @returns HTML string with ANSI sequences converted to styled spans
 */
export function handleANSIOutputToHTML(text: string): string {
    const textLength: number = text.length;
    
    let styleNames: string[] = [];
    let customFgColor: RGBA | string | undefined;
    let customBgColor: RGBA | string | undefined;
    let customUnderlineColor: RGBA | string | undefined;
    let colorsInverted: boolean = false;
    let currentPos: number = 0;
    let buffer: string = '';
    let result: string = '';

    while (currentPos < textLength) {
        let sequenceFound: boolean = false;

        // Potentially an ANSI escape sequence.
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
                if (buffer) {
                    result += createStylizedSpan(buffer, styleNames, customFgColor, customBgColor, customUnderlineColor);
                    buffer = '';
                }

                /*
                 * Certain ranges that are matched here do not contain real graphics rendition sequences. For
                 * the sake of having a simpler expression, they have been included anyway.
                 */
                if (ansiSequence.match(/^(?:[34][0-8]|9[0-7]|10[0-7]|[0-9]|2[1-5,7-9]|[34]9|5[8,9]|1[0-9])(?:;[349][0-7]|10[0-7]|[013]|[245]|[34]9)?(?:;[012]?[0-9]?[0-9])*;?m$/)) {
                    const styleCodes: number[] = ansiSequence.slice(0, -1) // Remove final 'm' character.
                        .split(';')                                       // Separate style codes.
                        .filter(elem => elem !== '')                     // Filter empty elems as '34;m' -> ['34', ''].
                        .map(elem => parseInt(elem, 10));                // Convert to numbers.

                    if (styleCodes[0] === 38 || styleCodes[0] === 48 || styleCodes[0] === 58) {
                        // Advanced color code - can't be combined with formatting codes like simple colors can
                        const colorType = (styleCodes[0] === 38) ? 'foreground' : ((styleCodes[0] === 48) ? 'background' : 'underline');

                        if (styleCodes[1] === 5) {
                            set8BitColor(styleCodes, colorType);
                        } else if (styleCodes[1] === 2) {
                            set24BitColor(styleCodes, colorType);
                        }
                    } else {
                        setBasicFormatters(styleCodes);
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
        result += createStylizedSpan(buffer, styleNames, customFgColor, customBgColor, customUnderlineColor);
    }

    return result;

    function createStylizedSpan(
        content: string,
        cssClasses: string[],
        textColor: RGBA | string | undefined,
        backgroundColor: RGBA | string | undefined,
        underlineColor: RGBA | string | undefined
    ): string {
        if (!content) {
            return '';
        }

        // Escape HTML content
        const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        if (cssClasses.length === 0 && !textColor && !backgroundColor && !underlineColor) {
            return escapedContent;
        }

        let styleAttr = '';
        const styles: string[] = [];

        if (textColor) {
            const colorValue = typeof textColor === 'string' 
                ? `var(${textColor})` 
                : `rgb(${textColor.r}, ${textColor.g}, ${textColor.b})`;
            styles.push(`color: ${colorValue}`);
        }
        if (backgroundColor) {
            const colorValue = typeof backgroundColor === 'string' 
                ? `var(${backgroundColor})` 
                : `rgb(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b})`;
            styles.push(`background-color: ${colorValue}`);
        }
        if (underlineColor) {
            const colorValue = typeof underlineColor === 'string' 
                ? `var(${underlineColor})` 
                : `rgb(${underlineColor.r}, ${underlineColor.g}, ${underlineColor.b})`;
            styles.push(`text-decoration-color: ${colorValue}`);
        }

        if (styles.length > 0) {
            styleAttr = ` style="${styles.join('; ')}"`;
        }

        const classAttr = cssClasses.length > 0 ? ` class="${cssClasses.join(' ')}"` : '';
        
        return `<span${classAttr}${styleAttr}>${escapedContent}</span>`;
    }

    /**
     * Change the foreground or background color by clearing the current color
     * and adding the new one.
     */
    function changeColor(colorType: 'foreground' | 'background' | 'underline', color?: RGBA | string): void {
        if (colorType === 'foreground') {
            customFgColor = color;
        } else if (colorType === 'background') {
            customBgColor = color;
        } else if (colorType === 'underline') {
            customUnderlineColor = color;
        }
        styleNames = styleNames.filter(style => style !== `code-${colorType}-colored`);
        if (color !== undefined) {
            styleNames.push(`code-${colorType}-colored`);
        }
    }

    /**
     * Swap foreground and background colors. Used for color inversion.
     */
    function reverseForegroundAndBackgroundColors(): void {
        const oldFgColor = customFgColor;
        changeColor('foreground', customBgColor);
        changeColor('background', oldFgColor);
    }

    /**
     * Calculate and set basic ANSI formatting.
     */
    function setBasicFormatters(styleCodes: number[]): void {
        for (const code of styleCodes) {
            switch (code) {
                case 0: { // reset (everything)
                    styleNames = [];
                    customFgColor = undefined;
                    customBgColor = undefined;
                    customUnderlineColor = undefined;
                    colorsInverted = false;
                    break;
                }
                case 1: { // bold
                    styleNames = styleNames.filter(style => style !== 'code-bold');
                    styleNames.push('code-bold');
                    break;
                }
                case 2: { // dim
                    styleNames = styleNames.filter(style => style !== 'code-dim');
                    styleNames.push('code-dim');
                    break;
                }
                case 3: { // italic
                    styleNames = styleNames.filter(style => style !== 'code-italic');
                    styleNames.push('code-italic');
                    break;
                }
                case 4: { // underline
                    styleNames = styleNames.filter(style => (style !== 'code-underline' && style !== 'code-double-underline'));
                    styleNames.push('code-underline');
                    break;
                }
                case 5: { // blink
                    styleNames = styleNames.filter(style => style !== 'code-blink');
                    styleNames.push('code-blink');
                    break;
                }
                case 6: { // rapid blink
                    styleNames = styleNames.filter(style => style !== 'code-rapid-blink');
                    styleNames.push('code-rapid-blink');
                    break;
                }
                case 7: { // invert foreground and background
                    if (!colorsInverted) {
                        colorsInverted = true;
                        reverseForegroundAndBackgroundColors();
                    }
                    break;
                }
                case 8: { // hidden
                    styleNames = styleNames.filter(style => style !== 'code-hidden');
                    styleNames.push('code-hidden');
                    break;
                }
                case 9: { // strike-through/crossed-out
                    styleNames = styleNames.filter(style => style !== 'code-strike-through');
                    styleNames.push('code-strike-through');
                    break;
                }
                case 10: { // normal default font
                    styleNames = styleNames.filter(style => !style.startsWith('code-font'));
                    break;
                }
                case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18: case 19: case 20: { // font codes
                    styleNames = styleNames.filter(style => !style.startsWith('code-font'));
                    styleNames.push(`code-font-${code - 10}`);
                    break;
                }
                case 21: { // double underline
                    styleNames = styleNames.filter(style => (style !== 'code-underline' && style !== 'code-double-underline'));
                    styleNames.push('code-double-underline');
                    break;
                }
                case 22: { // normal intensity (bold off and dim off)
                    styleNames = styleNames.filter(style => (style !== 'code-bold' && style !== 'code-dim'));
                    break;
                }
                case 23: { // Neither italic or blackletter
                    styleNames = styleNames.filter(style => (style !== 'code-italic' && style !== 'code-font-10'));
                    break;
                }
                case 24: { // not underlined
                    styleNames = styleNames.filter(style => (style !== 'code-underline' && style !== 'code-double-underline'));
                    break;
                }
                case 25: { // not blinking
                    styleNames = styleNames.filter(style => (style !== 'code-blink' && style !== 'code-rapid-blink'));
                    break;
                }
                case 27: { // not reversed/inverted
                    if (colorsInverted) {
                        colorsInverted = false;
                        reverseForegroundAndBackgroundColors();
                    }
                    break;
                }
                case 28: { // not hidden (reveal)
                    styleNames = styleNames.filter(style => style !== 'code-hidden');
                    break;
                }
                case 29: { // not crossed-out
                    styleNames = styleNames.filter(style => style !== 'code-strike-through');
                    break;
                }
                case 53: { // overlined
                    styleNames = styleNames.filter(style => style !== 'code-overline');
                    styleNames.push('code-overline');
                    break;
                }
                case 55: { // not overlined
                    styleNames = styleNames.filter(style => style !== 'code-overline');
                    break;
                }
                case 39: { // default foreground color
                    changeColor('foreground', undefined);
                    break;
                }
                case 49: { // default background color
                    changeColor('background', undefined);
                    break;
                }
                case 59: { // default underline color
                    changeColor('underline', undefined);
                    break;
                }
                case 73: { // superscript
                    styleNames = styleNames.filter(style => (style !== 'code-superscript' && style !== 'code-subscript'));
                    styleNames.push('code-superscript');
                    break;
                }
                case 74: { // subscript
                    styleNames = styleNames.filter(style => (style !== 'code-superscript' && style !== 'code-subscript'));
                    styleNames.push('code-subscript');
                    break;
                }
                case 75: { // neither superscript or subscript
                    styleNames = styleNames.filter(style => (style !== 'code-superscript' && style !== 'code-subscript'));
                    break;
                }
                default: {
                    setBasicColor(code);
                    break;
                }
            }
        }
    }

    /**
     * Calculate and set styling for complicated 24-bit ANSI color codes.
     */
    function set24BitColor(styleCodes: number[], colorType: 'foreground' | 'background' | 'underline'): void {
        if (styleCodes.length >= 5 &&
            styleCodes[2] >= 0 && styleCodes[2] <= 255 &&
            styleCodes[3] >= 0 && styleCodes[3] <= 255 &&
            styleCodes[4] >= 0 && styleCodes[4] <= 255) {
            const customColor = new RGBA(styleCodes[2], styleCodes[3], styleCodes[4]);
            changeColor(colorType, customColor);
        }
    }

    /**
     * Calculate and set styling for advanced 8-bit ANSI color codes.
     */
    function set8BitColor(styleCodes: number[], colorType: 'foreground' | 'background' | 'underline'): void {
        let colorNumber = styleCodes[2];
        const color = calcANSI8bitColor(colorNumber);

        if (color) {
            changeColor(colorType, color);
        } else if (colorNumber >= 0 && colorNumber <= 15) {
            if (colorType === 'underline') {
                const colorName = ansiColorIdentifiers[colorNumber];
                changeColor(colorType, `--vscode-debug-ansi-${colorName}`);
                return;
            }
            // Need to map to one of the four basic color ranges
            colorNumber += 30;
            if (colorNumber >= 38) {
                // Bright colors
                colorNumber += 52;
            }
            if (colorType === 'background') {
                colorNumber += 10;
            }
            setBasicColor(colorNumber);
        }
    }

    /**
     * Calculate and set styling for basic bright and dark ANSI color codes.
     */
    function setBasicColor(styleCode: number): void {
        let colorType: 'foreground' | 'background' | undefined;
        let colorIndex: number | undefined;

        if (styleCode >= 30 && styleCode <= 37) {
            colorIndex = styleCode - 30;
            colorType = 'foreground';
        } else if (styleCode >= 90 && styleCode <= 97) {
            colorIndex = (styleCode - 90) + 8; // High-intensity (bright)
            colorType = 'foreground';
        } else if (styleCode >= 40 && styleCode <= 47) {
            colorIndex = styleCode - 40;
            colorType = 'background';
        } else if (styleCode >= 100 && styleCode <= 107) {
            colorIndex = (styleCode - 100) + 8; // High-intensity (bright)
            colorType = 'background';
        }

        if (colorIndex !== undefined && colorType) {
            const colorName = ansiColorIdentifiers[colorIndex];
            changeColor(colorType, `--vscode-debug-ansi-${colorName.replace(/\./g, '-')}`);
        }
    }
}

/**
 * Calculate the color from the color set defined in the ANSI 8-bit standard.
 */
function calcANSI8bitColor(colorNumber: number): RGBA | undefined {
    if (colorNumber % 1 !== 0) {
        return;
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

        return new RGBA(red, green, blue);
    } else if (colorNumber >= 232 && colorNumber <= 255) {
        // Converts to a grayscale value
        colorNumber -= 232;
        const colorLevel: number = Math.round(colorNumber / 23 * 255);
        return new RGBA(colorLevel, colorLevel, colorLevel);
    } else {
        return;
    }
}