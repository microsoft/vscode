/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isHTMLSpanElement } from '../../../../../base/browser/dom.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { registerColors } from '../../../terminal/common/terminalColorRegistry.js';
import { appendStylizedStringToContainer, calcANSI8bitColor, handleANSIOutput } from '../../browser/debugANSIHandling.js';
import { LinkDetector } from '../../browser/linkDetector.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel } from './mockDebugModel.js';
suite('Debug - ANSI Handling', () => {
    let disposables;
    let model;
    let session;
    let linkDetector;
    /**
     * Instantiate services for use by the functions being tested.
     */
    setup(() => {
        disposables = new DisposableStore();
        model = createMockDebugModel(disposables);
        session = createTestSession(model);
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        linkDetector = instantiationService.createInstance(LinkDetector);
        registerColors();
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('appendStylizedStringToContainer', () => {
        const root = document.createElement('span');
        let child;
        assert.strictEqual(0, root.children.length);
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        appendStylizedStringToContainer(root, 'content1', ['class1', 'class2'], linkDetector, session.root, undefined, undefined, undefined, undefined, 0, hoverBehavior);
        appendStylizedStringToContainer(root, 'content2', ['class2', 'class3'], linkDetector, session.root, undefined, undefined, undefined, undefined, 0, hoverBehavior);
        assert.strictEqual(2, root.children.length);
        child = root.firstChild;
        if (isHTMLSpanElement(child)) {
            assert.strictEqual('content1', child.textContent);
            assert(child.classList.contains('class1'));
            assert(child.classList.contains('class2'));
        }
        else {
            assert.fail('Unexpected assertion error');
        }
        child = root.lastChild;
        if (isHTMLSpanElement(child)) {
            assert.strictEqual('content2', child.textContent);
            assert(child.classList.contains('class2'));
            assert(child.classList.contains('class3'));
        }
        else {
            assert.fail('Unexpected assertion error');
        }
        hoverBehavior.store.dispose();
    });
    /**
     * Apply an ANSI sequence to {@link #getSequenceOutput}.
     *
     * @param sequence The ANSI sequence to stylize.
     * @returns An {@link HTMLSpanElement} that contains the stylized text.
     */
    function getSequenceOutput(sequence) {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const root = handleANSIOutput(sequence, linkDetector, session.root, [], hoverBehavior);
        assert.strictEqual(1, root.children.length);
        const child = root.lastChild;
        hoverBehavior.store.dispose();
        if (isHTMLSpanElement(child)) {
            return child;
        }
        else {
            assert.fail('Unexpected assertion error');
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
    function assertSingleSequenceElement(sequence, assertion) {
        const child = getSequenceOutput(sequence + 'content');
        assert.strictEqual('content', child.textContent);
        assertion(child);
    }
    /**
     * Assert that a given DOM element has the custom inline CSS style matching
     * the color value provided.
     * @param element The HTML span element to look at.
     * @param colorType If `foreground`, will check the element's css `color`;
     * if `background`, will check the element's css `backgroundColor`.
     * if `underline`, will check the elements css `textDecorationColor`.
     * @param color RGBA object to compare color to. If `undefined` or not provided,
     * will assert that no value is set.
     * @param message Optional custom message to pass to assertion.
     * @param colorShouldMatch Optional flag (defaults TO true) which allows caller to indicate that the color SHOULD NOT MATCH
     * (for testing changes to theme colors where we need color to have changed but we don't know exact color it should have
     * changed to (but we do know the color it should NO LONGER BE))
     */
    function assertInlineColor(element, colorType, color, message, colorShouldMatch = true) {
        if (color !== undefined) {
            const cssColor = Color.Format.CSS.formatRGB(new Color(color));
            if (colorType === 'background') {
                const styleBefore = element.style.backgroundColor;
                element.style.backgroundColor = cssColor;
                assert((styleBefore === element.style.backgroundColor) === colorShouldMatch, message || `Incorrect ${colorType} color style found (found color: ${styleBefore}, expected ${cssColor}).`);
            }
            else if (colorType === 'foreground') {
                const styleBefore = element.style.color;
                element.style.color = cssColor;
                assert((styleBefore === element.style.color) === colorShouldMatch, message || `Incorrect ${colorType} color style found (found color: ${styleBefore}, expected ${cssColor}).`);
            }
            else {
                const styleBefore = element.style.textDecorationColor;
                element.style.textDecorationColor = cssColor;
                assert((styleBefore === element.style.textDecorationColor) === colorShouldMatch, message || `Incorrect ${colorType} color style found (found color: ${styleBefore}, expected ${cssColor}).`);
            }
        }
        else {
            if (colorType === 'background') {
                assert(!element.style.backgroundColor, message || `Defined ${colorType} color style found when it should not have been defined`);
            }
            else if (colorType === 'foreground') {
                assert(!element.style.color, message || `Defined ${colorType} color style found when it should not have been defined`);
            }
            else {
                assert(!element.style.textDecorationColor, message || `Defined ${colorType} color style found when it should not have been defined`);
            }
        }
    }
    test('Expected single sequence operation', () => {
        // Bold code
        assertSingleSequenceElement('\x1b[1m', (child) => {
            assert(child.classList.contains('code-bold'), 'Bold formatting not detected after bold ANSI code.');
        });
        // Italic code
        assertSingleSequenceElement('\x1b[3m', (child) => {
            assert(child.classList.contains('code-italic'), 'Italic formatting not detected after italic ANSI code.');
        });
        // Underline code
        assertSingleSequenceElement('\x1b[4m', (child) => {
            assert(child.classList.contains('code-underline'), 'Underline formatting not detected after underline ANSI code.');
        });
        for (let i = 30; i <= 37; i++) {
            const customClassName = 'code-foreground-colored';
            // Foreground colour class
            assertSingleSequenceElement('\x1b[' + i + 'm', (child) => {
                assert(child.classList.contains(customClassName), `Custom foreground class not found on element after foreground ANSI code #${i}.`);
            });
            // Cancellation code removes colour class
            assertSingleSequenceElement('\x1b[' + i + ';39m', (child) => {
                assert(child.classList.contains(customClassName) === false, 'Custom foreground class still found after foreground cancellation code.');
                assertInlineColor(child, 'foreground', undefined, 'Custom color style still found after foreground cancellation code.');
            });
        }
        for (let i = 40; i <= 47; i++) {
            const customClassName = 'code-background-colored';
            // Foreground colour class
            assertSingleSequenceElement('\x1b[' + i + 'm', (child) => {
                assert(child.classList.contains(customClassName), `Custom background class not found on element after background ANSI code #${i}.`);
            });
            // Cancellation code removes colour class
            assertSingleSequenceElement('\x1b[' + i + ';49m', (child) => {
                assert(child.classList.contains(customClassName) === false, 'Custom background class still found after background cancellation code.');
                assertInlineColor(child, 'foreground', undefined, 'Custom color style still found after background cancellation code.');
            });
        }
        // check all basic colors for underlines (full range is checked elsewhere, here we check cancelation)
        for (let i = 0; i <= 255; i++) {
            const customClassName = 'code-underline-colored';
            // Underline colour class
            assertSingleSequenceElement('\x1b[58;5;' + i + 'm', (child) => {
                assert(child.classList.contains(customClassName), `Custom underline color class not found on element after underline color ANSI code 58;5;${i}m.`);
            });
            // Cancellation underline color code removes colour class
            assertSingleSequenceElement('\x1b[58;5;' + i + 'm\x1b[59m', (child) => {
                assert(child.classList.contains(customClassName) === false, 'Custom underline color class still found after underline color cancellation code 59m.');
                assertInlineColor(child, 'underline', undefined, 'Custom underline color style still found after underline color cancellation code 59m.');
            });
        }
        // Different codes do not cancel each other
        assertSingleSequenceElement('\x1b[1;3;4;30;41m', (child) => {
            assert.strictEqual(5, child.classList.length, 'Incorrect number of classes found for different ANSI codes.');
            assert(child.classList.contains('code-bold'));
            assert(child.classList.contains('code-italic'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-underline'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-foreground-colored'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-background-colored'), 'Different ANSI codes should not cancel each other.');
        });
        // Different codes do not ACCUMULATE more than one copy of each class
        assertSingleSequenceElement('\x1b[1;1;2;2;3;3;4;4;5;5;6;6;8;8;9;9;21;21;53;53;73;73;74;74m', (child) => {
            assert(child.classList.contains('code-bold'));
            assert(child.classList.contains('code-italic'), 'italic missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-underline') === false, 'underline PRESENT and double underline should have removed it- Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-dim'), 'dim missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-blink'), 'blink missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-rapid-blink'), 'rapid blink mkssing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-double-underline'), 'double underline missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-hidden'), 'hidden missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-strike-through'), 'strike-through missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-overline'), 'overline missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-superscript') === false, 'superscript PRESENT and subscript should have removed it- Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert(child.classList.contains('code-subscript'), 'subscript missing Doubles of each Different ANSI codes should not cancel each other or accumulate.');
            assert.strictEqual(10, child.classList.length, 'Incorrect number of classes found for each style code sent twice ANSI codes.');
        });
        // More Different codes do not cancel each other
        assertSingleSequenceElement('\x1b[1;2;5;6;21;8;9m', (child) => {
            assert.strictEqual(7, child.classList.length, 'Incorrect number of classes found for different ANSI codes.');
            assert(child.classList.contains('code-bold'));
            assert(child.classList.contains('code-dim'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-blink'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-rapid-blink'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-double-underline'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-hidden'), 'Different ANSI codes should not cancel each other.');
            assert(child.classList.contains('code-strike-through'), 'Different ANSI codes should not cancel each other.');
        });
        // New foreground codes don't remove old background codes and vice versa
        assertSingleSequenceElement('\x1b[40;31;42;33m', (child) => {
            assert.strictEqual(2, child.classList.length);
            assert(child.classList.contains('code-background-colored'), 'New foreground ANSI code should not cancel existing background formatting.');
            assert(child.classList.contains('code-foreground-colored'), 'New background ANSI code should not cancel existing foreground formatting.');
        });
        // Duplicate codes do not change output
        assertSingleSequenceElement('\x1b[1;1;4;1;4;4;1;4m', (child) => {
            assert(child.classList.contains('code-bold'), 'Duplicate formatting codes should have no effect.');
            assert(child.classList.contains('code-underline'), 'Duplicate formatting codes should have no effect.');
        });
        // Extra terminating semicolon does not change output
        assertSingleSequenceElement('\x1b[1;4;m', (child) => {
            assert(child.classList.contains('code-bold'), 'Extra semicolon after ANSI codes should have no effect.');
            assert(child.classList.contains('code-underline'), 'Extra semicolon after ANSI codes should have no effect.');
        });
        // Cancellation code removes multiple codes
        assertSingleSequenceElement('\x1b[1;4;30;41;32;43;34;45;36;47;0m', (child) => {
            assert.strictEqual(0, child.classList.length, 'Cancellation ANSI code should clear ALL formatting.');
            assertInlineColor(child, 'background', undefined, 'Cancellation ANSI code should clear ALL formatting.');
            assertInlineColor(child, 'foreground', undefined, 'Cancellation ANSI code should clear ALL formatting.');
        });
    });
    test('Expected single 8-bit color sequence operation', () => {
        // Basic and bright color codes specified with 8-bit color code format
        for (let i = 0; i <= 15; i++) {
            // As these are controlled by theme, difficult to check actual color value
            // Foreground codes should add standard classes
            assertSingleSequenceElement('\x1b[38;5;' + i + 'm', (child) => {
                assert(child.classList.contains('code-foreground-colored'), `Custom color class not found after foreground 8-bit color code 38;5;${i}`);
            });
            // Background codes should add standard classes
            assertSingleSequenceElement('\x1b[48;5;' + i + 'm', (child) => {
                assert(child.classList.contains('code-background-colored'), `Custom color class not found after background 8-bit color code 48;5;${i}`);
            });
        }
        // 8-bit advanced colors
        for (let i = 16; i <= 255; i++) {
            // Foreground codes should add custom class and inline style
            assertSingleSequenceElement('\x1b[38;5;' + i + 'm', (child) => {
                assert(child.classList.contains('code-foreground-colored'), `Custom color class not found after foreground 8-bit color code 38;5;${i}`);
                assertInlineColor(child, 'foreground', calcANSI8bitColor(i), `Incorrect or no color styling found after foreground 8-bit color code 38;5;${i}`);
            });
            // Background codes should add custom class and inline style
            assertSingleSequenceElement('\x1b[48;5;' + i + 'm', (child) => {
                assert(child.classList.contains('code-background-colored'), `Custom color class not found after background 8-bit color code 48;5;${i}`);
                assertInlineColor(child, 'background', calcANSI8bitColor(i), `Incorrect or no color styling found after background 8-bit color code 48;5;${i}`);
            });
            // Color underline codes should add custom class and inline style
            assertSingleSequenceElement('\x1b[58;5;' + i + 'm', (child) => {
                assert(child.classList.contains('code-underline-colored'), `Custom color class not found after underline 8-bit color code 58;5;${i}`);
                assertInlineColor(child, 'underline', calcANSI8bitColor(i), `Incorrect or no color styling found after underline 8-bit color code 58;5;${i}`);
            });
        }
        // Bad (nonexistent) color should not render
        assertSingleSequenceElement('\x1b[48;5;300m', (child) => {
            assert.strictEqual(0, child.classList.length, 'Bad ANSI color codes should have no effect.');
        });
        // Should ignore any codes after the ones needed to determine color
        assertSingleSequenceElement('\x1b[48;5;100;42;77;99;4;24m', (child) => {
            assert(child.classList.contains('code-background-colored'));
            assert.strictEqual(1, child.classList.length);
            assertInlineColor(child, 'background', calcANSI8bitColor(100));
        });
    });
    test('Expected single 24-bit color sequence operation', () => {
        // 24-bit advanced colors
        for (let r = 0; r <= 255; r += 64) {
            for (let g = 0; g <= 255; g += 64) {
                for (let b = 0; b <= 255; b += 64) {
                    const color = new RGBA(r, g, b);
                    // Foreground codes should add class and inline style
                    assertSingleSequenceElement(`\x1b[38;2;${r};${g};${b}m`, (child) => {
                        assert(child.classList.contains('code-foreground-colored'), 'DOM should have "code-foreground-colored" class for advanced ANSI colors.');
                        assertInlineColor(child, 'foreground', color);
                    });
                    // Background codes should add class and inline style
                    assertSingleSequenceElement(`\x1b[48;2;${r};${g};${b}m`, (child) => {
                        assert(child.classList.contains('code-background-colored'), 'DOM should have "code-foreground-colored" class for advanced ANSI colors.');
                        assertInlineColor(child, 'background', color);
                    });
                    // Underline color codes should add class and inline style
                    assertSingleSequenceElement(`\x1b[58;2;${r};${g};${b}m`, (child) => {
                        assert(child.classList.contains('code-underline-colored'), 'DOM should have "code-underline-colored" class for advanced ANSI colors.');
                        assertInlineColor(child, 'underline', color);
                    });
                }
            }
        }
        // Invalid color should not render
        assertSingleSequenceElement('\x1b[38;2;4;4m', (child) => {
            assert.strictEqual(0, child.classList.length, `Invalid color code "38;2;4;4" should not add a class (classes found: ${child.classList}).`);
            assert(!child.style.color, `Invalid color code "38;2;4;4" should not add a custom color CSS (found color: ${child.style.color}).`);
        });
        // Bad (nonexistent) color should not render
        assertSingleSequenceElement('\x1b[48;2;150;300;5m', (child) => {
            assert.strictEqual(0, child.classList.length, `Nonexistent color code "48;2;150;300;5" should not add a class (classes found: ${child.classList}).`);
        });
        // Should ignore any codes after the ones needed to determine color
        assertSingleSequenceElement('\x1b[48;2;100;42;77;99;200;75m', (child) => {
            assert(child.classList.contains('code-background-colored'), `Color code with extra (valid) items "48;2;100;42;77;99;200;75" should still treat initial part as valid code and add class "code-background-custom".`);
            assert.strictEqual(1, child.classList.length, `Color code with extra items "48;2;100;42;77;99;200;75" should add one and only one class. (classes found: ${child.classList}).`);
            assertInlineColor(child, 'background', new RGBA(100, 42, 77), `Color code "48;2;100;42;77;99;200;75" should  style background-color as rgb(100,42,77).`);
        });
    });
    /**
     * Assert that a given ANSI sequence produces the expected number of {@link HTMLSpanElement} children. For
     * each child, run the provided assertion.
     *
     * @param sequence The ANSI sequence to verify.
     * @param assertions A set of assertions to run on the resulting children.
     */
    function assertMultipleSequenceElements(sequence, assertions, elementsExpected) {
        if (elementsExpected === undefined) {
            elementsExpected = assertions.length;
        }
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const root = handleANSIOutput(sequence, linkDetector, session.root, [], hoverBehavior);
        assert.strictEqual(elementsExpected, root.children.length);
        for (let i = 0; i < elementsExpected; i++) {
            const child = root.children[i];
            if (isHTMLSpanElement(child)) {
                assertions[i](child);
            }
            else {
                assert.fail('Unexpected assertion error');
            }
        }
        hoverBehavior.store.dispose();
    }
    test('Expected multiple sequence operation', () => {
        // Multiple codes affect the same text
        assertSingleSequenceElement('\x1b[1m\x1b[3m\x1b[4m\x1b[32m', (child) => {
            assert(child.classList.contains('code-bold'), 'Bold class not found after multiple different ANSI codes.');
            assert(child.classList.contains('code-italic'), 'Italic class not found after multiple different ANSI codes.');
            assert(child.classList.contains('code-underline'), 'Underline class not found after multiple different ANSI codes.');
            assert(child.classList.contains('code-foreground-colored'), 'Foreground color class not found after multiple different ANSI codes.');
        });
        // Consecutive codes do not affect previous ones
        assertMultipleSequenceElements('\x1b[1mbold\x1b[32mgreen\x1b[4munderline\x1b[3mitalic\x1b[0mnothing', [
            (bold) => {
                assert.strictEqual(1, bold.classList.length);
                assert(bold.classList.contains('code-bold'), 'Bold class not found after bold ANSI code.');
            },
            (green) => {
                assert.strictEqual(2, green.classList.length);
                assert(green.classList.contains('code-bold'), 'Bold class not found after both bold and color ANSI codes.');
                assert(green.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (underline) => {
                assert.strictEqual(3, underline.classList.length);
                assert(underline.classList.contains('code-bold'), 'Bold class not found after bold, color, and underline ANSI codes.');
                assert(underline.classList.contains('code-foreground-colored'), 'Color class not found after color and underline ANSI codes.');
                assert(underline.classList.contains('code-underline'), 'Underline class not found after underline ANSI code.');
            },
            (italic) => {
                assert.strictEqual(4, italic.classList.length);
                assert(italic.classList.contains('code-bold'), 'Bold class not found after bold, color, underline, and italic ANSI codes.');
                assert(italic.classList.contains('code-foreground-colored'), 'Color class not found after color, underline, and italic ANSI codes.');
                assert(italic.classList.contains('code-underline'), 'Underline class not found after underline and italic ANSI codes.');
                assert(italic.classList.contains('code-italic'), 'Italic class not found after italic ANSI code.');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after reset ANSI code.');
            },
        ], 5);
        // Consecutive codes with ENDING/OFF codes do not LEAVE affect previous ones
        assertMultipleSequenceElements('\x1b[1mbold\x1b[22m\x1b[32mgreen\x1b[4munderline\x1b[24m\x1b[3mitalic\x1b[23mjustgreen\x1b[0mnothing', [
            (bold) => {
                assert.strictEqual(1, bold.classList.length);
                assert(bold.classList.contains('code-bold'), 'Bold class not found after bold ANSI code.');
            },
            (green) => {
                assert.strictEqual(1, green.classList.length);
                assert(green.classList.contains('code-bold') === false, 'Bold class found after both bold WAS TURNED OFF with 22m');
                assert(green.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (underline) => {
                assert.strictEqual(2, underline.classList.length);
                assert(underline.classList.contains('code-foreground-colored'), 'Color class not found after color and underline ANSI codes.');
                assert(underline.classList.contains('code-underline'), 'Underline class not found after underline ANSI code.');
            },
            (italic) => {
                assert.strictEqual(2, italic.classList.length);
                assert(italic.classList.contains('code-foreground-colored'), 'Color class not found after color, underline, and italic ANSI codes.');
                assert(italic.classList.contains('code-underline') === false, 'Underline class found after underline WAS TURNED OFF with 24m');
                assert(italic.classList.contains('code-italic'), 'Italic class not found after italic ANSI code.');
            },
            (justgreen) => {
                assert.strictEqual(1, justgreen.classList.length);
                assert(justgreen.classList.contains('code-italic') === false, 'Italic class found after italic WAS TURNED OFF with 23m');
                assert(justgreen.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after reset ANSI code.');
            },
        ], 6);
        // more Consecutive codes with ENDING/OFF codes do not LEAVE affect previous ones
        assertMultipleSequenceElements('\x1b[2mdim\x1b[22m\x1b[32mgreen\x1b[5mslowblink\x1b[25m\x1b[6mrapidblink\x1b[25mjustgreen\x1b[0mnothing', [
            (dim) => {
                assert.strictEqual(1, dim.classList.length);
                assert(dim.classList.contains('code-dim'), 'Dim class not found after dim ANSI code 2m.');
            },
            (green) => {
                assert.strictEqual(1, green.classList.length);
                assert(green.classList.contains('code-dim') === false, 'Dim class found after dim WAS TURNED OFF with 22m');
                assert(green.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (slowblink) => {
                assert.strictEqual(2, slowblink.classList.length);
                assert(slowblink.classList.contains('code-foreground-colored'), 'Color class not found after color and blink ANSI codes.');
                assert(slowblink.classList.contains('code-blink'), 'Blink class not found after underline ANSI code 5m.');
            },
            (rapidblink) => {
                assert.strictEqual(2, rapidblink.classList.length);
                assert(rapidblink.classList.contains('code-foreground-colored'), 'Color class not found after color, blink, and rapid blink ANSI codes.');
                assert(rapidblink.classList.contains('code-blink') === false, 'blink class found after underline WAS TURNED OFF with 25m');
                assert(rapidblink.classList.contains('code-rapid-blink'), 'Rapid blink class not found after rapid blink ANSI code 6m.');
            },
            (justgreen) => {
                assert.strictEqual(1, justgreen.classList.length);
                assert(justgreen.classList.contains('code-rapid-blink') === false, 'Rapid blink class found after rapid blink WAS TURNED OFF with 25m');
                assert(justgreen.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after reset ANSI code.');
            },
        ], 6);
        // more Consecutive codes with ENDING/OFF codes do not LEAVE affect previous ones
        assertMultipleSequenceElements('\x1b[8mhidden\x1b[28m\x1b[32mgreen\x1b[9mcrossedout\x1b[29m\x1b[21mdoubleunderline\x1b[24mjustgreen\x1b[0mnothing', [
            (hidden) => {
                assert.strictEqual(1, hidden.classList.length);
                assert(hidden.classList.contains('code-hidden'), 'Hidden class not found after dim ANSI code 8m.');
            },
            (green) => {
                assert.strictEqual(1, green.classList.length);
                assert(green.classList.contains('code-hidden') === false, 'Hidden class found after Hidden WAS TURNED OFF with 28m');
                assert(green.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (crossedout) => {
                assert.strictEqual(2, crossedout.classList.length);
                assert(crossedout.classList.contains('code-foreground-colored'), 'Color class not found after color and hidden ANSI codes.');
                assert(crossedout.classList.contains('code-strike-through'), 'strike-through class not found after crossout/strikethrough ANSI code 9m.');
            },
            (doubleunderline) => {
                assert.strictEqual(2, doubleunderline.classList.length);
                assert(doubleunderline.classList.contains('code-foreground-colored'), 'Color class not found after color, hidden, and crossedout ANSI codes.');
                assert(doubleunderline.classList.contains('code-strike-through') === false, 'strike-through class found after strike-through WAS TURNED OFF with 29m');
                assert(doubleunderline.classList.contains('code-double-underline'), 'Double underline class not found after double underline ANSI code 21m.');
            },
            (justgreen) => {
                assert.strictEqual(1, justgreen.classList.length);
                assert(justgreen.classList.contains('code-double-underline') === false, 'Double underline class found after double underline WAS TURNED OFF with 24m');
                assert(justgreen.classList.contains('code-foreground-colored'), 'Color class not found after color ANSI code.');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after reset ANSI code.');
            },
        ], 6);
        // underline, double underline are mutually exclusive, test underline->double underline->off and double underline->underline->off
        assertMultipleSequenceElements('\x1b[4munderline\x1b[21mdouble underline\x1b[24munderlineOff\x1b[21mdouble underline\x1b[4munderline\x1b[24munderlineOff', [
            (underline) => {
                assert.strictEqual(1, underline.classList.length);
                assert(underline.classList.contains('code-underline'), 'Underline class not found after underline ANSI code 4m.');
            },
            (doubleunderline) => {
                assert(doubleunderline.classList.contains('code-underline') === false, 'Underline class found after double underline code 21m');
                assert(doubleunderline.classList.contains('code-double-underline'), 'Double underline class not found after double underline code 21m');
                assert.strictEqual(1, doubleunderline.classList.length, 'should have found only double underline');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after underline off code 4m.');
            },
            (doubleunderline) => {
                assert(doubleunderline.classList.contains('code-double-underline'), 'Double underline class not found after double underline code 21m');
                assert.strictEqual(1, doubleunderline.classList.length, 'should have found only double underline');
            },
            (underline) => {
                assert(underline.classList.contains('code-double-underline') === false, 'Double underline class found after underline code 4m');
                assert(underline.classList.contains('code-underline'), 'Underline class not found after underline ANSI code 4m.');
                assert.strictEqual(1, underline.classList.length, 'should have found only underline');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after underline off code 4m.');
            },
        ], 6);
        // underline and strike-through and overline can exist at the same time and
        // in any combination
        assertMultipleSequenceElements('\x1b[4munderline\x1b[9mand strikethough\x1b[53mand overline\x1b[24munderlineOff\x1b[55moverlineOff\x1b[29mstriklethoughOff', [
            (underline) => {
                assert.strictEqual(1, underline.classList.length, 'should have found only underline');
                assert(underline.classList.contains('code-underline'), 'Underline class not found after underline ANSI code 4m.');
            },
            (strikethrough) => {
                assert(strikethrough.classList.contains('code-underline'), 'Underline class NOT found after strikethrough code 9m');
                assert(strikethrough.classList.contains('code-strike-through'), 'Strike through class not found after strikethrough code 9m');
                assert.strictEqual(2, strikethrough.classList.length, 'should have found underline and strikethrough');
            },
            (overline) => {
                assert(overline.classList.contains('code-underline'), 'Underline class NOT found after overline code 53m');
                assert(overline.classList.contains('code-strike-through'), 'Strike through class not found after overline code 53m');
                assert(overline.classList.contains('code-overline'), 'Overline class not found after overline code 53m');
                assert.strictEqual(3, overline.classList.length, 'should have found underline,strikethrough and overline');
            },
            (underlineoff) => {
                assert(underlineoff.classList.contains('code-underline') === false, 'Underline class found after underline off code 24m');
                assert(underlineoff.classList.contains('code-strike-through'), 'Strike through class not found after underline off code 24m');
                assert(underlineoff.classList.contains('code-overline'), 'Overline class not found after underline off code 24m');
                assert.strictEqual(2, underlineoff.classList.length, 'should have found strikethrough and overline');
            },
            (overlineoff) => {
                assert(overlineoff.classList.contains('code-underline') === false, 'Underline class found after overline off code 55m');
                assert(overlineoff.classList.contains('code-overline') === false, 'Overline class found after overline off code 55m');
                assert(overlineoff.classList.contains('code-strike-through'), 'Strike through class not found after overline off code 55m');
                assert.strictEqual(1, overlineoff.classList.length, 'should have found only strikethrough');
            },
            (nothing) => {
                assert(nothing.classList.contains('code-strike-through') === false, 'Strike through class found after strikethrough off code 29m');
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after strikethough OFF code 29m');
            },
        ], 6);
        // double underline and strike-through and overline can exist at the same time and
        // in any combination
        assertMultipleSequenceElements('\x1b[21mdoubleunderline\x1b[9mand strikethough\x1b[53mand overline\x1b[29mstriklethoughOff\x1b[55moverlineOff\x1b[24munderlineOff', [
            (doubleunderline) => {
                assert.strictEqual(1, doubleunderline.classList.length, 'should have found only doubleunderline');
                assert(doubleunderline.classList.contains('code-double-underline'), 'Double underline class not found after double underline ANSI code 21m.');
            },
            (strikethrough) => {
                assert(strikethrough.classList.contains('code-double-underline'), 'Double nderline class NOT found after strikethrough code 9m');
                assert(strikethrough.classList.contains('code-strike-through'), 'Strike through class not found after strikethrough code 9m');
                assert.strictEqual(2, strikethrough.classList.length, 'should have found doubleunderline and strikethrough');
            },
            (overline) => {
                assert(overline.classList.contains('code-double-underline'), 'Double underline class NOT found after overline code 53m');
                assert(overline.classList.contains('code-strike-through'), 'Strike through class not found after overline code 53m');
                assert(overline.classList.contains('code-overline'), 'Overline class not found after overline code 53m');
                assert.strictEqual(3, overline.classList.length, 'should have found doubleunderline,overline and strikethrough');
            },
            (strikethrougheoff) => {
                assert(strikethrougheoff.classList.contains('code-double-underline'), 'Double underline class NOT found after strikethrough off code 29m');
                assert(strikethrougheoff.classList.contains('code-overline'), 'Overline class NOT found after strikethrough off code 29m');
                assert(strikethrougheoff.classList.contains('code-strike-through') === false, 'Strike through class found after strikethrough off code 29m');
                assert.strictEqual(2, strikethrougheoff.classList.length, 'should have found doubleunderline and overline');
            },
            (overlineoff) => {
                assert(overlineoff.classList.contains('code-double-underline'), 'Double underline class NOT found after overline off code 55m');
                assert(overlineoff.classList.contains('code-strike-through') === false, 'Strike through class found after overline off code 55m');
                assert(overlineoff.classList.contains('code-overline') === false, 'Overline class found after overline off code 55m');
                assert.strictEqual(1, overlineoff.classList.length, 'Should have found only double underline');
            },
            (nothing) => {
                assert(nothing.classList.contains('code-double-underline') === false, 'Double underline class found after underline off code 24m');
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after underline OFF code 24m');
            },
        ], 6);
        // superscript and subscript are mutually exclusive, test superscript->subscript->off and subscript->superscript->off
        assertMultipleSequenceElements('\x1b[73msuperscript\x1b[74msubscript\x1b[75mneither\x1b[74msubscript\x1b[73msuperscript\x1b[75mneither', [
            (superscript) => {
                assert.strictEqual(1, superscript.classList.length, 'should only be superscript class');
                assert(superscript.classList.contains('code-superscript'), 'Superscript class not found after superscript ANSI code 73m.');
            },
            (subscript) => {
                assert(subscript.classList.contains('code-superscript') === false, 'Superscript class found after subscript code 74m');
                assert(subscript.classList.contains('code-subscript'), 'Subscript class not found after subscript code 74m');
                assert.strictEqual(1, subscript.classList.length, 'should have found only subscript class');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after superscript/subscript off code 75m.');
            },
            (subscript) => {
                assert(subscript.classList.contains('code-subscript'), 'Subscript class not found after subscript code 74m');
                assert.strictEqual(1, subscript.classList.length, 'should have found only subscript class');
            },
            (superscript) => {
                assert(superscript.classList.contains('code-subscript') === false, 'Subscript class found after superscript code 73m');
                assert(superscript.classList.contains('code-superscript'), 'Superscript class not found after superscript ANSI code 73m.');
                assert.strictEqual(1, superscript.classList.length, 'should have found only superscript class');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more style classes still found after superscipt/subscript off code 75m.');
            },
        ], 6);
        // Consecutive font codes switch to new font class and remove previous and then final switch to default font removes class
        assertMultipleSequenceElements('\x1b[11mFont1\x1b[12mFont2\x1b[13mFont3\x1b[14mFont4\x1b[15mFont5\x1b[10mdefaultFont', [
            (font1) => {
                assert.strictEqual(1, font1.classList.length);
                assert(font1.classList.contains('code-font-1'), 'font 1 class NOT found after switch to font 1 with ANSI code 11m');
            },
            (font2) => {
                assert.strictEqual(1, font2.classList.length);
                assert(font2.classList.contains('code-font-1') === false, 'font 1 class found after switch to font 2 with ANSI code 12m');
                assert(font2.classList.contains('code-font-2'), 'font 2 class NOT found after switch to font 2 with ANSI code 12m');
            },
            (font3) => {
                assert.strictEqual(1, font3.classList.length);
                assert(font3.classList.contains('code-font-2') === false, 'font 2 class found after switch to font 3 with ANSI code 13m');
                assert(font3.classList.contains('code-font-3'), 'font 3 class NOT found after switch to font 3 with ANSI code 13m');
            },
            (font4) => {
                assert.strictEqual(1, font4.classList.length);
                assert(font4.classList.contains('code-font-3') === false, 'font 3 class found after switch to font 4 with ANSI code 14m');
                assert(font4.classList.contains('code-font-4'), 'font 4 class NOT found after switch to font 4 with ANSI code 14m');
            },
            (font5) => {
                assert.strictEqual(1, font5.classList.length);
                assert(font5.classList.contains('code-font-4') === false, 'font 4 class found after switch to font 5 with ANSI code 15m');
                assert(font5.classList.contains('code-font-5'), 'font 5 class NOT found after switch to font 5 with ANSI code 15m');
            },
            (defaultfont) => {
                assert.strictEqual(0, defaultfont.classList.length, 'One or more font style classes still found after reset to default font with ANSI code 10m.');
            },
        ], 6);
        // More Consecutive font codes switch to new font class and remove previous and then final switch to default font removes class
        assertMultipleSequenceElements('\x1b[16mFont6\x1b[17mFont7\x1b[18mFont8\x1b[19mFont9\x1b[20mFont10\x1b[10mdefaultFont', [
            (font6) => {
                assert.strictEqual(1, font6.classList.length);
                assert(font6.classList.contains('code-font-6'), 'font 6 class NOT found after switch to font 6 with ANSI code 16m');
            },
            (font7) => {
                assert.strictEqual(1, font7.classList.length);
                assert(font7.classList.contains('code-font-6') === false, 'font 6 class found after switch to font 7 with ANSI code 17m');
                assert(font7.classList.contains('code-font-7'), 'font 7 class NOT found after switch to font 7 with ANSI code 17m');
            },
            (font8) => {
                assert.strictEqual(1, font8.classList.length);
                assert(font8.classList.contains('code-font-7') === false, 'font 7 class found after switch to font 8 with ANSI code 18m');
                assert(font8.classList.contains('code-font-8'), 'font 8 class NOT found after switch to font 8 with ANSI code 18m');
            },
            (font9) => {
                assert.strictEqual(1, font9.classList.length);
                assert(font9.classList.contains('code-font-8') === false, 'font 8 class found after switch to font 9 with ANSI code 19m');
                assert(font9.classList.contains('code-font-9'), 'font 9 class NOT found after switch to font 9 with ANSI code 19m');
            },
            (font10) => {
                assert.strictEqual(1, font10.classList.length);
                assert(font10.classList.contains('code-font-9') === false, 'font 9 class found after switch to font 10 with ANSI code 20m');
                assert(font10.classList.contains('code-font-10'), `font 10 class NOT found after switch to font 10 with ANSI code 20m (${font10.classList})`);
            },
            (defaultfont) => {
                assert.strictEqual(0, defaultfont.classList.length, 'One or more font style classes (2nd series) still found after reset to default font with ANSI code 10m.');
            },
        ], 6);
        // Blackletter font codes can be turned off with other font codes or 23m
        assertMultipleSequenceElements('\x1b[3mitalic\x1b[20mfont10blacklatter\x1b[23mitalicAndBlackletterOff\x1b[20mFont10Again\x1b[11mFont1\x1b[10mdefaultFont', [
            (italic) => {
                assert.strictEqual(1, italic.classList.length);
                assert(italic.classList.contains('code-italic'), 'italic class NOT found after italic code ANSI code 3m');
            },
            (font10) => {
                assert.strictEqual(2, font10.classList.length);
                assert(font10.classList.contains('code-italic'), 'no itatic class found after switch to font 10 (blackletter) with ANSI code 20m');
                assert(font10.classList.contains('code-font-10'), 'font 10 class NOT found after switch to font 10 with ANSI code 20m');
            },
            (italicAndBlackletterOff) => {
                assert.strictEqual(0, italicAndBlackletterOff.classList.length, 'italic or blackletter (font10) class found after both switched off with ANSI code 23m');
            },
            (font10) => {
                assert.strictEqual(1, font10.classList.length);
                assert(font10.classList.contains('code-font-10'), 'font 10 class NOT found after switch to font 10 with ANSI code 20m');
            },
            (font1) => {
                assert.strictEqual(1, font1.classList.length);
                assert(font1.classList.contains('code-font-10') === false, 'font 10 class found after switch to font 1 with ANSI code 11m');
                assert(font1.classList.contains('code-font-1'), 'font 1 class NOT found after switch to font 1 with ANSI code 11m');
            },
            (defaultfont) => {
                assert.strictEqual(0, defaultfont.classList.length, 'One or more font style classes (2nd series) still found after reset to default font with ANSI code 10m.');
            },
        ], 6);
        // italic can be turned on/off with affecting font codes 1-9  (italic off will clear 'blackletter'(font 23) as per spec)
        assertMultipleSequenceElements('\x1b[3mitalic\x1b[12mfont2\x1b[23mitalicOff\x1b[3mitalicFont2\x1b[10mjustitalic\x1b[23mnothing', [
            (italic) => {
                assert.strictEqual(1, italic.classList.length);
                assert(italic.classList.contains('code-italic'), 'italic class NOT found after italic code ANSI code 3m');
            },
            (font10) => {
                assert.strictEqual(2, font10.classList.length);
                assert(font10.classList.contains('code-italic'), 'no itatic class found after switch to font 2 with ANSI code 12m');
                assert(font10.classList.contains('code-font-2'), 'font 2 class NOT found after switch to font 2 with ANSI code 12m');
            },
            (italicOff) => {
                assert.strictEqual(1, italicOff.classList.length, 'italic class found after both switched off with ANSI code 23m');
                assert(italicOff.classList.contains('code-italic') === false, 'itatic class found after switching it OFF with ANSI code 23m');
                assert(italicOff.classList.contains('code-font-2'), 'font 2 class NOT found after switching italic off with ANSI code 23m');
            },
            (italicFont2) => {
                assert.strictEqual(2, italicFont2.classList.length);
                assert(italicFont2.classList.contains('code-italic'), 'no itatic class found after italic ANSI code 3m');
                assert(italicFont2.classList.contains('code-font-2'), 'font 2 class NOT found after italic ANSI code 3m');
            },
            (justitalic) => {
                assert.strictEqual(1, justitalic.classList.length);
                assert(justitalic.classList.contains('code-font-2') === false, 'font 2 class found after switch to default font with ANSI code 10m');
                assert(justitalic.classList.contains('code-italic'), 'italic class NOT found after switch to default font with ANSI code 10m');
            },
            (nothing) => {
                assert.strictEqual(0, nothing.classList.length, 'One or more classes still found after final italic removal with ANSI code 23m.');
            },
        ], 6);
        // Reverse video reverses Foreground/Background colors WITH both SET and can called in sequence
        assertMultipleSequenceElements('\x1b[38;2;10;20;30mfg10,20,30\x1b[48;2;167;168;169mbg167,168,169\x1b[7m8ReverseVideo\x1b[7mDuplicateReverseVideo\x1b[27mReverseOff\x1b[27mDupReverseOff', [
            (fg10_20_30) => {
                assert.strictEqual(1, fg10_20_30.classList.length, 'Foreground ANSI color code should add one class.');
                assert(fg10_20_30.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(fg10_20_30, 'foreground', new RGBA(10, 20, 30), '24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
            (bg167_168_169) => {
                assert.strictEqual(2, bg167_168_169.classList.length, 'background ANSI color codes should only add a single class.');
                assert(bg167_168_169.classList.contains('code-background-colored'), 'Background ANSI color codes should add custom background color class.');
                assertInlineColor(bg167_168_169, 'background', new RGBA(167, 168, 169), '24-bit RGBA ANSI background color code (167,168,169) should add matching color inline style.');
                assert(bg167_168_169.classList.contains('code-foreground-colored'), 'Still Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(bg167_168_169, 'foreground', new RGBA(10, 20, 30), 'Still 24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
            (reverseVideo) => {
                assert.strictEqual(2, reverseVideo.classList.length, 'background ANSI color codes should only add a single class.');
                assert(reverseVideo.classList.contains('code-background-colored'), 'Background ANSI color codes should add custom background color class.');
                assertInlineColor(reverseVideo, 'foreground', new RGBA(167, 168, 169), 'Reversed 24-bit RGBA ANSI foreground color code (167,168,169) should add matching former background color inline style.');
                assert(reverseVideo.classList.contains('code-foreground-colored'), 'Still Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(reverseVideo, 'background', new RGBA(10, 20, 30), 'Reversed 24-bit RGBA ANSI background color code (10,20,30) should add matching former foreground color inline style.');
            },
            (dupReverseVideo) => {
                assert.strictEqual(2, dupReverseVideo.classList.length, 'After second Reverse Video - background ANSI color codes should only add a single class.');
                assert(dupReverseVideo.classList.contains('code-background-colored'), 'After second Reverse Video - Background ANSI color codes should add custom background color class.');
                assertInlineColor(dupReverseVideo, 'foreground', new RGBA(167, 168, 169), 'After second Reverse Video - Reversed 24-bit RGBA ANSI foreground color code (167,168,169) should add matching former background color inline style.');
                assert(dupReverseVideo.classList.contains('code-foreground-colored'), 'After second Reverse Video - Still Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(dupReverseVideo, 'background', new RGBA(10, 20, 30), 'After second Reverse Video - Reversed 24-bit RGBA ANSI background color code (10,20,30) should add matching former foreground color inline style.');
            },
            (reversedBack) => {
                assert.strictEqual(2, reversedBack.classList.length, 'Reversed Back - background ANSI color codes should only add a single class.');
                assert(reversedBack.classList.contains('code-background-colored'), 'Reversed Back - Background ANSI color codes should add custom background color class.');
                assertInlineColor(reversedBack, 'background', new RGBA(167, 168, 169), 'Reversed Back - 24-bit RGBA ANSI background color code (167,168,169) should add matching color inline style.');
                assert(reversedBack.classList.contains('code-foreground-colored'), 'Reversed Back -  Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(reversedBack, 'foreground', new RGBA(10, 20, 30), 'Reversed Back -  24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
            (dupReversedBack) => {
                assert.strictEqual(2, dupReversedBack.classList.length, '2nd Reversed Back - background ANSI color codes should only add a single class.');
                assert(dupReversedBack.classList.contains('code-background-colored'), '2nd Reversed Back - Background ANSI color codes should add custom background color class.');
                assertInlineColor(dupReversedBack, 'background', new RGBA(167, 168, 169), '2nd Reversed Back - 24-bit RGBA ANSI background color code (167,168,169) should add matching color inline style.');
                assert(dupReversedBack.classList.contains('code-foreground-colored'), '2nd Reversed Back -  Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(dupReversedBack, 'foreground', new RGBA(10, 20, 30), '2nd Reversed Back -  24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
        ], 6);
        // Reverse video reverses Foreground/Background colors WITH ONLY foreground color SET
        assertMultipleSequenceElements('\x1b[38;2;10;20;30mfg10,20,30\x1b[7m8ReverseVideo\x1b[27mReverseOff', [
            (fg10_20_30) => {
                assert.strictEqual(1, fg10_20_30.classList.length, 'Foreground ANSI color code should add one class.');
                assert(fg10_20_30.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(fg10_20_30, 'foreground', new RGBA(10, 20, 30), '24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
            (reverseVideo) => {
                assert.strictEqual(1, reverseVideo.classList.length, 'Background ANSI color codes should only add a single class.');
                assert(reverseVideo.classList.contains('code-background-colored'), 'Background ANSI color codes should add custom background color class.');
                assert(reverseVideo.classList.contains('code-foreground-colored') === false, 'After Reverse with NO background the Foreground ANSI color codes should NOT BE SET.');
                assertInlineColor(reverseVideo, 'background', new RGBA(10, 20, 30), 'Reversed 24-bit RGBA ANSI background color code (10,20,30) should add matching former foreground color inline style.');
            },
            (reversedBack) => {
                assert.strictEqual(1, reversedBack.classList.length, 'Reversed Back - background ANSI color codes should only add a single class.');
                assert(reversedBack.classList.contains('code-background-colored') === false, 'AFTER Reversed Back - Background ANSI color should NOT BE SET.');
                assert(reversedBack.classList.contains('code-foreground-colored'), 'Reversed Back -  Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(reversedBack, 'foreground', new RGBA(10, 20, 30), 'Reversed Back -  24-bit RGBA ANSI color code (10,20,30) should add matching color inline style.');
            },
        ], 3);
        // Reverse video reverses Foreground/Background colors WITH ONLY background color SET
        assertMultipleSequenceElements('\x1b[48;2;167;168;169mbg167,168,169\x1b[7m8ReverseVideo\x1b[27mReverseOff', [
            (bg167_168_169) => {
                assert.strictEqual(1, bg167_168_169.classList.length, 'Background ANSI color code should add one class.');
                assert(bg167_168_169.classList.contains('code-background-colored'), 'Background ANSI color codes should add custom foreground color class.');
                assertInlineColor(bg167_168_169, 'background', new RGBA(167, 168, 169), '24-bit RGBA ANSI color code (167, 168, 169) should add matching background color inline style.');
            },
            (reverseVideo) => {
                assert.strictEqual(1, reverseVideo.classList.length, 'After ReverseVideo Foreground ANSI color codes should only add a single class.');
                assert(reverseVideo.classList.contains('code-foreground-colored'), 'After ReverseVideo Foreground ANSI color codes should add custom background color class.');
                assert(reverseVideo.classList.contains('code-background-colored') === false, 'After Reverse with NO foreground color the background ANSI color codes should BE SET.');
                assertInlineColor(reverseVideo, 'foreground', new RGBA(167, 168, 169), 'Reversed 24-bit RGBA ANSI background color code (10,20,30) should add matching former background color inline style.');
            },
            (reversedBack) => {
                assert.strictEqual(1, reversedBack.classList.length, 'Reversed Back - background ANSI color codes should only add a single class.');
                assert(reversedBack.classList.contains('code-foreground-colored') === false, 'AFTER Reversed Back - Foreground ANSI color should NOT BE SET.');
                assert(reversedBack.classList.contains('code-background-colored'), 'Reversed Back -  Background ANSI color codes should add custom background color class.');
                assertInlineColor(reversedBack, 'background', new RGBA(167, 168, 169), 'Reversed Back -  24-bit RGBA ANSI color code (10,20,30) should add matching background color inline style.');
            },
        ], 3);
        // Underline color Different types of color codes still cancel each other
        assertMultipleSequenceElements('\x1b[58;2;101;102;103m24bitUnderline101,102,103\x1b[58;5;3m8bitsimpleUnderline\x1b[58;2;104;105;106m24bitUnderline104,105,106\x1b[58;5;101m8bitadvanced\x1b[58;2;200;200;200munderline200,200,200\x1b[59mUnderlineColorResetToDefault', [
            (adv24Bit) => {
                assert.strictEqual(1, adv24Bit.classList.length, 'Underline ANSI color codes should only add a single class (1).');
                assert(adv24Bit.classList.contains('code-underline-colored'), 'Underline ANSI color codes should add custom underline color class.');
                assertInlineColor(adv24Bit, 'underline', new RGBA(101, 102, 103), '24-bit RGBA ANSI color code (101,102,103) should add matching color inline style.');
            },
            (adv8BitSimple) => {
                assert.strictEqual(1, adv8BitSimple.classList.length, 'Multiple underline ANSI color codes should only add a single class (2).');
                assert(adv8BitSimple.classList.contains('code-underline-colored'), 'Underline ANSI color codes should add custom underline color class.');
                // changed to simple theme color, don't know exactly what it should be, but it should NO LONGER BE 101,102,103
                assertInlineColor(adv8BitSimple, 'underline', new RGBA(101, 102, 103), 'Change to theme color SHOULD NOT STILL BE 24-bit RGBA ANSI color code (101,102,103) should add matching color inline style.', false);
            },
            (adv24BitAgain) => {
                assert.strictEqual(1, adv24BitAgain.classList.length, 'Multiple underline ANSI color codes should only add a single class (3).');
                assert(adv24BitAgain.classList.contains('code-underline-colored'), 'Underline ANSI color codes should add custom underline color class.');
                assertInlineColor(adv24BitAgain, 'underline', new RGBA(104, 105, 106), '24-bit RGBA ANSI color code (100,100,100) should add matching color inline style.');
            },
            (adv8BitAdvanced) => {
                assert.strictEqual(1, adv8BitAdvanced.classList.length, 'Multiple underline ANSI color codes should only add a single class (4).');
                assert(adv8BitAdvanced.classList.contains('code-underline-colored'), 'Underline ANSI color codes should add custom underline color class.');
                // changed to 8bit advanced color, don't know exactly what it should be, but it should NO LONGER BE 104,105,106
                assertInlineColor(adv8BitAdvanced, 'underline', new RGBA(104, 105, 106), 'Change to theme color SHOULD NOT BE 24-bit RGBA ANSI color code (104,105,106) should add matching color inline style.', false);
            },
            (adv24BitUnderlin200) => {
                assert.strictEqual(1, adv24BitUnderlin200.classList.length, 'Multiple underline ANSI color codes should only add a single class 4.');
                assert(adv24BitUnderlin200.classList.contains('code-underline-colored'), 'Underline ANSI color codes should add custom underline color class.');
                assertInlineColor(adv24BitUnderlin200, 'underline', new RGBA(200, 200, 200), 'after change underline color SHOULD BE 24-bit RGBA ANSI color code (200,200,200) should add matching color inline style.');
            },
            (underlineColorResetToDefault) => {
                assert.strictEqual(0, underlineColorResetToDefault.classList.length, 'After Underline Color reset to default NO underline color class should be set.');
                assertInlineColor(underlineColorResetToDefault, 'underline', undefined, 'after RESET TO DEFAULT underline color SHOULD NOT BE SET (no color inline style.)');
            },
        ], 6);
        // Different types of color codes still cancel each other
        assertMultipleSequenceElements('\x1b[34msimple\x1b[38;2;101;102;103m24bit\x1b[38;5;3m8bitsimple\x1b[38;2;104;105;106m24bitAgain\x1b[38;5;101m8bitadvanced', [
            (simple) => {
                assert.strictEqual(1, simple.classList.length, 'Foreground ANSI color code should add one class.');
                assert(simple.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
            },
            (adv24Bit) => {
                assert.strictEqual(1, adv24Bit.classList.length, 'Multiple foreground ANSI color codes should only add a single class.');
                assert(adv24Bit.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(adv24Bit, 'foreground', new RGBA(101, 102, 103), '24-bit RGBA ANSI color code (101,102,103) should add matching color inline style.');
            },
            (adv8BitSimple) => {
                assert.strictEqual(1, adv8BitSimple.classList.length, 'Multiple foreground ANSI color codes should only add a single class.');
                assert(adv8BitSimple.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                //color is theme based, so we can't check what it should be but we know it should NOT BE 101,102,103 anymore
                assertInlineColor(adv8BitSimple, 'foreground', new RGBA(101, 102, 103), 'SHOULD NOT LONGER BE 24-bit RGBA ANSI color code (101,102,103) after simple color change.', false);
            },
            (adv24BitAgain) => {
                assert.strictEqual(1, adv24BitAgain.classList.length, 'Multiple foreground ANSI color codes should only add a single class.');
                assert(adv24BitAgain.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                assertInlineColor(adv24BitAgain, 'foreground', new RGBA(104, 105, 106), '24-bit RGBA ANSI color code (104,105,106) should add matching color inline style.');
            },
            (adv8BitAdvanced) => {
                assert.strictEqual(1, adv8BitAdvanced.classList.length, 'Multiple foreground ANSI color codes should only add a single class.');
                assert(adv8BitAdvanced.classList.contains('code-foreground-colored'), 'Foreground ANSI color codes should add custom foreground color class.');
                // color should NO LONGER BE 104,105,106
                assertInlineColor(adv8BitAdvanced, 'foreground', new RGBA(104, 105, 106), 'SHOULD NOT LONGER BE 24-bit RGBA ANSI color code (104,105,106) after advanced color change.', false);
            }
        ], 5);
    });
    /**
     * Assert that the provided ANSI sequence exactly matches the text content of the resulting
     * {@link HTMLSpanElement}.
     *
     * @param sequence The ANSI sequence to verify.
     */
    function assertSequencestrictEqualToContent(sequence) {
        const child = getSequenceOutput(sequence);
        assert(child.textContent === sequence);
    }
    test('Invalid codes treated as regular text', () => {
        // Individual components of ANSI code start are printed
        assertSequencestrictEqualToContent('\x1b');
        assertSequencestrictEqualToContent('[');
        // Unsupported sequence prints both characters
        assertSequencestrictEqualToContent('\x1b[');
        // Random strings are displayed properly
        for (let i = 0; i < 50; i++) {
            const uuid = generateUuid();
            assertSequencestrictEqualToContent(uuid);
        }
    });
    /**
     * Assert that a given ANSI sequence maintains added content following the ANSI code, and that
     * the expression itself is thrown away.
     *
     * @param sequence The ANSI sequence to verify. The provided sequence should contain ANSI codes
     * only, and should not include actual text content as it is provided by this function.
     */
    function assertEmptyOutput(sequence) {
        const child = getSequenceOutput(sequence + 'content');
        assert.strictEqual('content', child.textContent);
        assert.strictEqual(0, child.classList.length);
    }
    test('Empty sequence output', () => {
        const sequences = [
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
        const terminators = 'ABCDHIJKfhmpsu'.split('');
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
                    const colorOut = calcANSI8bitColor(16 + red * 36 + green * 6 + blue);
                    assert(colorOut.r === Math.round(red * (255 / 5)), 'Incorrect red value encountered for color');
                    assert(colorOut.g === Math.round(green * (255 / 5)), 'Incorrect green value encountered for color');
                    assert(colorOut.b === Math.round(blue * (255 / 5)), 'Incorrect balue value encountered for color');
                }
            }
        }
        // All grays
        for (let i = 232; i <= 255; i++) {
            const grayOut = calcANSI8bitColor(i);
            assert(grayOut.r === grayOut.g);
            assert(grayOut.r === grayOut.b);
            assert(grayOut.r === Math.round((i - 232) / 23 * 255));
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdBTlNJSGFuZGxpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL3Rlc3QvYnJvd3Nlci9kZWJ1Z0FOU0lIYW5kbGluZy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTFILE9BQU8sRUFBMEIsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFckYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFM0QsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUVuQyxJQUFJLFdBQTRCLENBQUM7SUFDakMsSUFBSSxLQUFpQixDQUFDO0lBQ3RCLElBQUksT0FBcUIsQ0FBQztJQUMxQixJQUFJLFlBQTBCLENBQUM7SUFFL0I7O09BRUc7SUFDSCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsS0FBSyxHQUFHLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFDLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuQyxNQUFNLG9CQUFvQixHQUF1RCw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdkksWUFBWSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNqRSxjQUFjLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7UUFDNUMsTUFBTSxJQUFJLEdBQW9CLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0QsSUFBSSxLQUFXLENBQUM7UUFFaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU1QyxNQUFNLGFBQWEsR0FBRyxFQUFFLElBQUkscUNBQTZCLEVBQUUsS0FBSyxFQUFFLElBQUksZUFBZSxFQUFFLEVBQUUsQ0FBQztRQUMxRiwrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxFQUFFLFlBQVksRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEssK0JBQStCLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxZQUFZLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRWxLLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFNUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFXLENBQUM7UUFDekIsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUM1QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBRUQsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFVLENBQUM7UUFDeEIsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNsRCxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUM1QyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsYUFBYSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FB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