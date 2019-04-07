/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
import { generateUuid } from 'vs/base/common/uuid';
import { appendStylizedStringToContainer, handleANSIOutput, calcANSI8bitColor } from 'vs/workbench/contrib/debug/browser/debugANSIHandling';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { Color, RGBA } from 'vs/base/common/color';

suite('Debug - ANSI Handling', () => {

	let linkDetector: LinkDetector;

	/**
	 * Instantiate a {@link LinkDetector} for use by the functions being tested.
	 */
	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService();
		linkDetector = instantiationService.createInstance(LinkDetector);
	});

	test('appendStylizedStringToContainer', () => {
		const root: HTMLSpanElement = document.createElement('span');
		let child: Node;

		assert.equal(0, root.children.length);

		appendStylizedStringToContainer(root, 'content1', ['class1', 'class2'], linkDetector);
		appendStylizedStringToContainer(root, 'content2', ['class2', 'class3'], linkDetector);

		assert.equal(2, root.children.length);

		child = root.firstChild!;
		if (child instanceof HTMLSpanElement) {
			assert.equal('content1', child.textContent);
			assert(dom.hasClass(child, 'class1'));
			assert(dom.hasClass(child, 'class2'));
		} else {
			assert.fail('Unexpected assertion error');
		}

		child = root.lastChild!;
		if (child instanceof HTMLSpanElement) {
			assert.equal('content2', child.textContent);
			assert(dom.hasClass(child, 'class2'));
			assert(dom.hasClass(child, 'class3'));
		} else {
			assert.fail('Unexpected assertion error');
		}
	});

	/**
	 * Apply an ANSI sequence to {@link #getSequenceOutput}.
	 *
	 * @param sequence The ANSI sequence to stylize.
	 * @returns An {@link HTMLSpanElement} that contains the stylized text.
	 */
	function getSequenceOutput(sequence: string): HTMLSpanElement {
		const root: HTMLSpanElement = handleANSIOutput(sequence, linkDetector);
		assert.equal(1, root.children.length);
		const child: Node = root.lastChild!;
		if (child instanceof HTMLSpanElement) {
			return child;
		} else {
			assert.fail('Unexpected assertion error');
			return null!;
		}
	}

	/**
	 * Assert that a given ANSI sequence maintains added content following the ANSI code, and that
	 * the provided {@param assertion} passes.
	 *
	 * @param sequence The ANSI sequence to verify. The provided sequence should contain ANSI codes
	 * only, and should not include actual text content as it is provided by this function.
	 * @param assertion The function used to verify the output.
	 */
	function assertSingleSequenceElement(sequence: string, assertion: (child: HTMLSpanElement) => void): void {
		const child: HTMLSpanElement = getSequenceOutput(sequence + 'content');
		assert.equal('content', child.textContent);
		assertion(child);
	}

	test('Expected single sequence operation', () => {

		// Bold code
		assertSingleSequenceElement('\x1b[1m', (child) => {
			assert(dom.hasClass(child, 'code-bold'));
		});

		// Italic code
		assertSingleSequenceElement('\x1b[3m', (child) => {
			assert(dom.hasClass(child, 'code-italic'));
		});

		// Underline code
		assertSingleSequenceElement('\x1b[4m', (child) => {
			assert(dom.hasClass(child, 'code-underline'));
		});

		for (let i = 30; i <= 37; i++) {
			const style: string = 'code-foreground-' + i;

			// Foreground colour codes
			assertSingleSequenceElement('\x1b[' + i + 'm', (child) => {
				assert(dom.hasClass(child, style));
			});

			// Cancellation code removes colour code
			assertSingleSequenceElement('\x1b[' + i + ';39m', (child) => {
				assert(dom.hasClass(child, style) === false);
			});
		}

		for (let i = 40; i <= 47; i++) {
			const style: string = 'code-background-' + i;

			// Foreground colour codes
			assertSingleSequenceElement('\x1b[' + i + 'm', (child) => {
				assert(dom.hasClass(child, style));
			});

			// Cancellation code removes colour code
			assertSingleSequenceElement('\x1b[' + i + ';49m', (child) => {
				assert(dom.hasClass(child, style) === false);
			});
		}

		// Different codes do not interfere
		assertSingleSequenceElement('\x1b[1;3;4;30;41m', (child) => {
			assert.equal(5, child.classList.length);

			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-italic'));
			assert(dom.hasClass(child, 'code-underline'));
			assert(dom.hasClass(child, 'code-foreground-30'));
			assert(dom.hasClass(child, 'code-background-41'));
		});

		// New foreground color codes remove old codes
		assertSingleSequenceElement('\x1b[30;31;32;33;34;35;36;37m', (child) => {
			assert.equal(1, child.classList.length);

			assert(dom.hasClass(child, 'code-foreground-37'));
		});

		// New background color codes remove old codes
		assertSingleSequenceElement('\x1b[40;41;42;43;44;45;46;47m', (child) => {
			assert.equal(1, child.classList.length);

			assert(dom.hasClass(child, 'code-background-47'));
		});

		// New foreground codes don't remove old background codes and vice versa
		assertSingleSequenceElement('\x1b[40;31;42;33m', (child) => {
			assert.equal(2, child.classList.length);

			assert(dom.hasClass(child, 'code-background-42'));
			assert(dom.hasClass(child, 'code-foreground-33'));
		});

		// Duplicate codes do not change output
		assertSingleSequenceElement('\x1b[1;1;4;1;4;4;1;4m', (child) => {
			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-underline'));
		});

		// Extra terminating semicolon does not change output
		assertSingleSequenceElement('\x1b[1;4;m', (child) => {
			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-underline'));
		});

		// Cancellation code removes multiple codes
		assertSingleSequenceElement('\x1b[1;4;30;41;32;43;34;45;36;47;0m', (child) => {
			assert.equal(0, child.classList.length);
		});

	});

	test('Expected single 8-bit color sequence operation', () => {
		// Basic color codes specified with 8-bit color code format
		for (let i = 0; i <= 7; i++) {
			// Foreground codes should add standard classes
			const fgStyle: string = 'code-foreground-' + (i + 30);
			assertSingleSequenceElement('\x1b[38;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, fgStyle));
			});

			// Background codes should add standard classes
			const bgStyle: string = 'code-background-' + (i + 40);
			assertSingleSequenceElement('\x1b[48;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, bgStyle));
			});
		}

		// Bright color codes specified with 8-bit color code format
		for (let i = 8; i <= 15; i++) {
			// Foreground codes should add standard classes
			const fgStyle: string = 'code-foreground-' + (i - 8 + 90);
			assertSingleSequenceElement('\x1b[38;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, fgStyle));
			});

			// Background codes should add standard classes
			const bgStyle: string = 'code-background-' + (i - 8 + 100);
			assertSingleSequenceElement('\x1b[48;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, bgStyle));
			});
		}

		// 8-bit advanced colors
		for (let i = 16; i <= 255; i++) {
			const color = Color.Format.CSS.formatRGB(
				new Color((calcANSI8bitColor(i) as RGBA))
			);

			// Foreground codes should add custom class and inline style
			assertSingleSequenceElement('\x1b[38;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, 'code-foreground-custom'));
				assert(child.style.color === color);
			});

			// Background codes should add custom class and inline style
			assertSingleSequenceElement('\x1b[48;5;' + i + 'm', (child) => {
				assert(dom.hasClass(child, 'code-background-custom'));
				assert(child.style.backgroundColor === color);
			});
		}

		// Bad (nonexistent) color should not render
		assertSingleSequenceElement('\x1b[48;5;300m', (child) => {
			assert.equal(0, child.classList.length);
		});

		// Should ignore any codes after the ones needed to determine color
		assertSingleSequenceElement('\x1b[48;5;100;42;77;99;4;24m', (child) => {
			const color = Color.Format.CSS.formatRGB(
				new Color((calcANSI8bitColor(100) as RGBA))
			);
			assert(dom.hasClass(child, 'code-background-custom'));
			assert.equal(1, child.classList.length);
			assert(child.style.backgroundColor === color);
		});
	});

	test('Expected single 24-bit color sequence operation', () => {
		// 24-bit advanced colors
		for (let r = 0; r <= 255; r += 64) {
			for (let g = 0; g <= 255; g += 64) {
				for (let b = 0; b <= 255; b += 64) {
					let cssColor: string = `rgb(${r},${g},${b})`;
					// Foreground codes should add custom class and inline style
					assertSingleSequenceElement(`\x1b[38;2;${r};${g};${b}m`, (child) => {
						assert(dom.hasClass(child, 'code-foreground-custom'), 'DOM should have "code-foreground-custom" class for advanced ANSI colors.');
						const styleBefore = child.style.color;
						child.style.color = cssColor;
						assert(styleBefore === child.style.color, `Incorrect inline color style found for ${cssColor} (found color: ${styleBefore}).`);
					});

					// Background codes should add custom class and inline style
					assertSingleSequenceElement(`\x1b[48;2;${r};${g};${b}m`, (child) => {
						assert(dom.hasClass(child, 'code-background-custom'), 'DOM should have "code-foreground-custom" class for advanced ANSI colors.');
						const styleBefore = child.style.backgroundColor;
						child.style.backgroundColor = cssColor;
						assert(styleBefore === child.style.backgroundColor, `Incorrect inline color style found for ${cssColor} (found color: ${styleBefore}).`);
					});
				}
			}
		}

		// Invalid color should not render
		assertSingleSequenceElement('\x1b[38;2;4;4m', (child) => {
			assert.equal(0, child.classList.length, `Invalid color code "38;2;4;4" should not add a class (classes found: ${child.classList}).`);
			assert(child.style.color === '', `Invalid color code "38;2;4;4" should not add a custom color CSS (found color: ${child.style.color}).`);
		});

		// Bad (nonexistent) color should not render
		assertSingleSequenceElement('\x1b[48;2;150;300;5m', (child) => {
			assert.equal(0, child.classList.length, `Nonexistent color code "48;2;150;300;5" should not add a class (classes found: ${child.classList}).`);
		});

		// Should ignore any codes after the ones needed to determine color
		assertSingleSequenceElement('\x1b[48;2;100;42;77;99;200;75m', (child) => {
			assert(dom.hasClass(child, 'code-background-custom'), `Color code with extra (valid) items "48;2;100;42;77;99;200;75" should still treat initial part as valid code and add class "code-background-custom".`);
			assert.equal(1, child.classList.length, `Color code with extra items "48;2;100;42;77;99;200;75" should add one and only one class. (classes found: ${child.classList}).`);
			let styleBefore = child.style.backgroundColor;
			child.style.backgroundColor = 'rgb(100,42,77)';
			assert(child.style.backgroundColor === styleBefore, `Color code "48;2;100;42;77;99;200;75" should  style background-color as rgb(100,42,77).`);
		});
	});


	/**
	 * Assert that a given ANSI sequence produces the expected number of {@link HTMLSpanElement} children. For
	 * each child, run the provided assertion.
	 *
	 * @param sequence The ANSI sequence to verify.
	 * @param assertions A set of assertions to run on the resulting children.
	 */
	function assertMultipleSequenceElements(sequence: string, assertions: Array<(child: HTMLSpanElement) => void>, elementsExpected?: number): void {
		if (elementsExpected === undefined) {
			elementsExpected = assertions.length;
		}
		const root: HTMLSpanElement = handleANSIOutput(sequence, linkDetector);
		assert.equal(elementsExpected, root.children.length);
		for (let i = 0; i < elementsExpected; i++) {
			const child: Node = root.children[i];
			if (child instanceof HTMLSpanElement) {
				assertions[i](child);
			} else {
				assert.fail('Unexpected assertion error');
			}
		}
	}

	test('Expected multiple sequence operation', () => {

		// Multiple codes affect the same text
		assertSingleSequenceElement('\x1b[1m\x1b[3m\x1b[4m\x1b[32m', (child) => {
			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-italic'));
			assert(dom.hasClass(child, 'code-underline'));
			assert(dom.hasClass(child, 'code-foreground-32'));
		});

		// Consecutive codes do not affect previous ones
		assertMultipleSequenceElements('\x1b[1mbold\x1b[32mgreen\x1b[4munderline\x1b[3mitalic\x1b[0mnothing', [
			(bold) => {
				assert.equal(1, bold.classList.length);
				assert(dom.hasClass(bold, 'code-bold'));
			},
			(green) => {
				assert.equal(2, green.classList.length);
				assert(dom.hasClass(green, 'code-bold'));
				assert(dom.hasClass(green, 'code-foreground-32'));
			},
			(underline) => {
				assert.equal(3, underline.classList.length);
				assert(dom.hasClass(underline, 'code-bold'));
				assert(dom.hasClass(underline, 'code-foreground-32'));
				assert(dom.hasClass(underline, 'code-underline'));
			},
			(italic) => {
				assert.equal(4, italic.classList.length);
				assert(dom.hasClass(italic, 'code-bold'));
				assert(dom.hasClass(italic, 'code-foreground-32'));
				assert(dom.hasClass(italic, 'code-underline'));
				assert(dom.hasClass(italic, 'code-italic'));
			},
			(nothing) => {
				assert.equal(0, nothing.classList.length);
			},
		], 5);

		// Different types of color codes still cancel each other
		assertMultipleSequenceElements('\x1b[34msimple\x1b[38;2;100;100;100m24bit\x1b[38;5;3m8bitsimple\x1b[38;5;101m8bitadvanced', [
			(simple) => {
				assert.equal(1, simple.classList.length);
				assert(dom.hasClass(simple, 'code-foreground-34'));
			},
			(adv24Bit) => {
				assert.equal(1, adv24Bit.classList.length);
				assert(dom.hasClass(adv24Bit, 'code-foreground-custom'));
				let styleBefore = adv24Bit.style.color;
				adv24Bit.style.color = 'rgb(100,100,100)';
				assert(adv24Bit.style.color === styleBefore);
			},
			(adv8BitSimple) => {
				assert.equal(1, adv8BitSimple.classList.length);
				assert(dom.hasClass(adv8BitSimple, 'code-foreground-33'));
				assert(adv8BitSimple.style.color === '');
			},
			(adv8BitAdvanced) => {
				assert.equal(1, adv8BitAdvanced.classList.length);
				assert(dom.hasClass(adv8BitAdvanced, 'code-foreground-custom'));
			}
		], 4);

	});

	/**
	 * Assert that the provided ANSI sequence exactly matches the text content of the resulting
	 * {@link HTMLSpanElement}.
	 *
	 * @param sequence The ANSI sequence to verify.
	 */
	function assertSequenceEqualToContent(sequence: string): void {
		const child: HTMLSpanElement = getSequenceOutput(sequence);
		assert(child.textContent === sequence);
	}

	test('Invalid codes treated as regular text', () => {

		// Individual components of ANSI code start are printed
		assertSequenceEqualToContent('\x1b');
		assertSequenceEqualToContent('[');

		// Unsupported sequence prints both characters
		assertSequenceEqualToContent('\x1b[');

		// Random strings are displayed properly
		for (let i = 0; i < 50; i++) {
			const uuid: string = generateUuid();
			assertSequenceEqualToContent(uuid);
		}

	});

	/**
	 * Assert that a given ANSI sequence maintains added content following the ANSI code, and that
	 * the expression itself is thrown away.
	 *
	 * @param sequence The ANSI sequence to verify. The provided sequence should contain ANSI codes
	 * only, and should not include actual text content as it is provided by this function.
	 */
	function assertEmptyOutput(sequence: string) {
		const child: HTMLSpanElement = getSequenceOutput(sequence + 'content');
		assert.equal('content', child.textContent);
		assert.equal(0, child.classList.length);
	}

	test('Empty sequence output', () => {

		const sequences: string[] = [
			// No colour codes
			'',
			'\x1b[;m',
			'\x1b[1;;m',
			'\x1b[m',
			'\x1b[99m'
		];

		sequences.forEach(sequence => {
			assertEmptyOutput(sequence);
		});

		// Check other possible ANSI terminators
		const terminators: string[] = 'ABCDHIJKfhmpsu'.split('');

		terminators.forEach(terminator => {
			assertEmptyOutput('\x1b[content' + terminator);
		});

	});

	test('calcANSI8bitColor', () => {
		// Invalid values
		// Negative (below range), simple range, decimals
		for (let i = -10; i <= 15; i += 0.5) {
			assert(calcANSI8bitColor(i) === undefined, 'Values less than 16 passed to calcANSI8bitColor should return undefined.');
		}
		// In-range range decimals
		for (let i = 16.5; i < 254; i += 1) {
			assert(calcANSI8bitColor(i) === undefined, 'Floats passed to calcANSI8bitColor should return undefined.');
		}
		// Above range
		for (let i = 256; i < 300; i += 0.5) {
			assert(calcANSI8bitColor(i) === undefined, 'Values grather than 255 passed to calcANSI8bitColor should return undefined.');
		}

		// All valid colors
		for (let red = 0; red <= 5; red++) {
			for (let green = 0; green <= 5; green++) {
				for (let blue = 0; blue <= 5; blue++) {
					let colorOut: any = calcANSI8bitColor(16 + red * 36 + green * 6 + blue);
					assert(colorOut.r === Math.round(red * (255 / 5)), 'Incorrect red value encountered for color');
					assert(colorOut.g === Math.round(green * (255 / 5)), 'Incorrect green value encountered for color');
					assert(colorOut.b === Math.round(blue * (255 / 5)), 'Incorrect balue value encountered for color');
				}
			}
		}

		// All grays
		for (let i = 232; i <= 255; i++) {
			let grayOut: any = calcANSI8bitColor(i);
			assert(grayOut.r === grayOut.g);
			assert(grayOut.r === grayOut.b);
			assert(grayOut.r === Math.round((i - 232) / 23 * 255));
		}
	});

});
