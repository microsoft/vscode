/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as dom from 'vs/base/browser/dom';
import { generateUuid } from 'vs/base/common/uuid';
import { appendStylizedStringToContainer, handleANSIOutput } from 'vs/workbench/parts/debug/browser/debugANSIHandling';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { LinkDetector } from 'vs/workbench/parts/debug/browser/linkDetector';

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

		// Codes do not interfere
		assertSingleSequenceElement('\x1b[1;4;30;31;32;33;34;35;36;37m', (child) => {
			assert.equal(10, child.classList.length);

			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-underline'));
			for (let i = 30; i <= 37; i++) {
				assert(dom.hasClass(child, 'code-foreground-' + i));
			}
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

	/**
	 * Assert that a given ANSI sequence produces the expected number of {@link HTMLSpanElement} children. For
	 * each child, run the provided assertion.
	 *
	 * @param sequence The ANSI sequence to verify.
	 * @param assertions A set of assertions to run on the resulting children.
	 */
	function assertMultipleSequenceElements(sequence: string, assertions: Array<(child: HTMLSpanElement) => void>): void {
		const root: HTMLSpanElement = handleANSIOutput(sequence, linkDetector);
		assert.equal(assertions.length, root.children.length);
		for (let i = 0; i < assertions.length; i++) {
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
		assertSingleSequenceElement('\x1b[1m\x1b[4m\x1b[32m', (child) => {
			assert(dom.hasClass(child, 'code-bold'));
			assert(dom.hasClass(child, 'code-underline'));
			assert(dom.hasClass(child, 'code-foreground-32'));
		});

		// Consecutive codes do not affect previous ones
		assertMultipleSequenceElements('\x1b[1mbold\x1b[32mgreen\x1b[4munderline\x1b[0mnothing', [
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
			(nothing) => {
				assert.equal(0, nothing.classList.length);
			},
		]);

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
			// Unsupported colour codes
			'\x1b[30;50m',
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

});
