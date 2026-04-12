/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { PromptInputModel } from '../../../../common/capabilities/commandDetection/promptInputModel.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ok, notDeepStrictEqual, strictEqual } from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { TestXtermLogger } from '../../terminalTestHelpers.js';
suite('PromptInputModel', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let promptInputModel;
    let xterm;
    let onCommandStart;
    let onCommandStartChanged;
    let onCommandExecuted;
    let onCommandFinished;
    async function writePromise(data) {
        await new Promise(r => xterm.write(data, r));
    }
    function fireCommandStart() {
        onCommandStart.fire({ marker: xterm.registerMarker() });
    }
    function fireCommandExecuted() {
        onCommandExecuted.fire(null);
    }
    function fireCommandFinished() {
        onCommandFinished.fire(null);
    }
    function setContinuationPrompt(prompt) {
        promptInputModel.setContinuationPrompt(prompt);
    }
    async function assertPromptInput(valueWithCursor) {
        await timeout(0);
        if (promptInputModel.cursorIndex !== -1 && !valueWithCursor.includes('|')) {
            throw new Error('assertPromptInput must contain | character');
        }
        const actualValueWithCursor = promptInputModel.getCombinedString();
        strictEqual(actualValueWithCursor, valueWithCursor.replaceAll('\n', '\u23CE'));
        // This is required to ensure the cursor index is correctly resolved for non-ascii characters
        const value = valueWithCursor.replace(/[\|\[\]]/g, '');
        const cursorIndex = valueWithCursor.indexOf('|');
        strictEqual(promptInputModel.value, value);
        strictEqual(promptInputModel.cursorIndex, cursorIndex, `value=${promptInputModel.value}`);
        ok(promptInputModel.ghostTextIndex === -1 || cursorIndex <= promptInputModel.ghostTextIndex, `cursorIndex (${cursorIndex}) must be before ghostTextIndex (${promptInputModel.ghostTextIndex})`);
    }
    setup(async () => {
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
        onCommandStart = store.add(new Emitter());
        onCommandStartChanged = store.add(new Emitter());
        onCommandExecuted = store.add(new Emitter());
        onCommandFinished = store.add(new Emitter());
        promptInputModel = store.add(new PromptInputModel(xterm, onCommandStart.event, onCommandStartChanged.event, onCommandExecuted.event, onCommandFinished.event, new NullLogService));
    });
    test('basic input and execute', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('foo bar');
        await assertPromptInput('foo bar|');
        await writePromise('\r\n');
        fireCommandExecuted();
        await assertPromptInput('foo bar');
        await writePromise('(command output)\r\n$ ');
        fireCommandStart();
        await assertPromptInput('|');
    });
    test('should not fire onDidChangeInput events when nothing changes', async () => {
        const events = [];
        store.add(promptInputModel.onDidChangeInput(e => events.push(e)));
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('foo');
        await assertPromptInput('foo|');
        await writePromise(' bar');
        await assertPromptInput('foo bar|');
        await writePromise('\r\n');
        fireCommandExecuted();
        await assertPromptInput('foo bar');
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('foo bar');
        await assertPromptInput('foo bar|');
        for (let i = 0; i < events.length - 1; i++) {
            notDeepStrictEqual(events[i], events[i + 1], 'not adjacent events should fire with the same value');
        }
    });
    test('should fire onDidInterrupt followed by onDidFinish when ctrl+c is pressed', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('foo');
        await assertPromptInput('foo|');
        await new Promise(r => {
            store.add(promptInputModel.onDidInterrupt(() => {
                // Fire onDidFinishInput immediately after onDidInterrupt
                store.add(promptInputModel.onDidFinishInput(() => {
                    r();
                }));
            }));
            xterm.input('\x03');
            writePromise('^C').then(() => fireCommandExecuted());
        });
    });
    test('should clear value when command finishes', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('echo hello');
        await assertPromptInput('echo hello|');
        fireCommandExecuted();
        strictEqual(promptInputModel.value, 'echo hello');
        fireCommandFinished();
        strictEqual(promptInputModel.value, '');
    });
    test('cursor navigation', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('foo bar');
        await assertPromptInput('foo bar|');
        await writePromise('\x1b[3D');
        await assertPromptInput('foo |bar');
        await writePromise('\x1b[4D');
        await assertPromptInput('|foo bar');
        await writePromise('\x1b[3C');
        await assertPromptInput('foo| bar');
        await writePromise('\x1b[4C');
        await assertPromptInput('foo bar|');
        await writePromise('\x1b[D');
        await assertPromptInput('foo ba|r');
        await writePromise('\x1b[C');
        await assertPromptInput('foo bar|');
    });
    suite('ghost text', () => {
        test('basic ghost text', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('foo\x1b[2m bar\x1b[0m\x1b[4D');
            await assertPromptInput('foo|[ bar]');
            await writePromise('\x1b[2D');
            await assertPromptInput('f|oo[ bar]');
        });
        test('trailing whitespace', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('foo    ');
            await writePromise('\x1b[4D');
            await assertPromptInput('foo|    ');
        });
        test('basic ghost text one word', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('pw\x1b[2md\x1b[1D');
            await assertPromptInput('pw|[d]');
        });
        test('ghost text with cursor navigation', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('foo\x1b[2m bar\x1b[0m\x1b[4D');
            await assertPromptInput('foo|[ bar]');
            await writePromise('\x1b[2D');
            await assertPromptInput('f|oo[ bar]');
            await writePromise('\x1b[C');
            await assertPromptInput('fo|o[ bar]');
            await writePromise('\x1b[C');
            await assertPromptInput('foo|[ bar]');
        });
        test('ghost text with different foreground colors only', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('foo\x1b[38;2;255;0;0m bar\x1b[0m\x1b[4D');
            await assertPromptInput('foo|[ bar]');
            await writePromise('\x1b[2D');
            await assertPromptInput('f|oo[ bar]');
        });
        test('no ghost text when foreground color matches earlier text', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[38;2;255;0;0mred1\x1b[0m ' + // Red "red1"
                '\x1b[38;2;0;255;0mgreen\x1b[0m ' + // Green "green"
                '\x1b[38;2;255;0;0mred2\x1b[0m' // Red "red2" (same as red1)
            );
            await assertPromptInput('red1 green red2|'); // No ghost text expected
        });
        test('ghost text detected when foreground color is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[38;2;255;0;0mcmd\x1b[0m ' + // Red "cmd"
                '\x1b[38;2;0;255;0marg\x1b[0m ' + // Green "arg"
                '\x1b[38;2;0;0;255mfinal\x1b[5D' // Blue "final" (ghost text)
            );
            await assertPromptInput('cmd arg |[final]');
        });
        test('no ghost text when background color matches earlier text', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[48;2;255;0;0mred_bg1\x1b[0m ' + // Red background
                '\x1b[48;2;0;255;0mgreen_bg\x1b[0m ' + // Green background
                '\x1b[48;2;255;0;0mred_bg2\x1b[0m' // Red background again
            );
            await assertPromptInput('red_bg1 green_bg red_bg2|'); // No ghost text expected
        });
        test('ghost text detected when background color is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[48;2;255;0;0mred_bg\x1b[0m ' + // Red background
                '\x1b[48;2;0;255;0mgreen_bg\x1b[0m ' + // Green background
                '\x1b[48;2;0;0;255mblue_bg\x1b[7D' // Blue background (ghost text)
            );
            await assertPromptInput('red_bg green_bg |[blue_bg]');
        });
        test('ghost text detected when bold style is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('text ' +
                '\x1b[1mBOLD\x1b[4D' // Bold "BOLD" (ghost text)
            );
            await assertPromptInput('text |[BOLD]');
        });
        test('no ghost text when earlier text has the same bold style', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[1mBOLD1\x1b[0m ' + // Bold "BOLD1"
                'normal ' +
                '\x1b[1mBOLD2\x1b[0m' // Bold "BOLD2" (same style as "BOLD1")
            );
            await assertPromptInput('BOLD1 normal BOLD2|'); // No ghost text expected
        });
        test('ghost text detected when italic style is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('text ' +
                '\x1b[3mITALIC\x1b[6D' // Italic "ITALIC" (ghost text)
            );
            await assertPromptInput('text |[ITALIC]');
        });
        test('no ghost text when earlier text has the same italic style', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[3mITALIC1\x1b[0m ' + // Italic "ITALIC1"
                'normal ' +
                '\x1b[3mITALIC2\x1b[0m' // Italic "ITALIC2" (same style as "ITALIC1")
            );
            await assertPromptInput('ITALIC1 normal ITALIC2|'); // No ghost text expected
        });
        test('ghost text detected when underline style is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('text ' +
                '\x1b[4mUNDERLINE\x1b[9D' // Underlined "UNDERLINE" (ghost text)
            );
            await assertPromptInput('text |[UNDERLINE]');
        });
        test('no ghost text when earlier text has the same underline style', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[4mUNDERLINE1\x1b[0m ' + // Underlined "UNDERLINE1"
                'normal ' +
                '\x1b[4mUNDERLINE2\x1b[0m' // Underlined "UNDERLINE2" (same style as "UNDERLINE1")
            );
            await assertPromptInput('UNDERLINE1 normal UNDERLINE2|'); // No ghost text expected
        });
        test('ghost text detected when strikethrough style is unique at the end', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('text ' +
                '\x1b[9mSTRIKE\x1b[6D' // Strikethrough "STRIKE" (ghost text)
            );
            await assertPromptInput('text |[STRIKE]');
        });
        test('no ghost text when earlier text has the same strikethrough style', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('\x1b[9mSTRIKE1\x1b[0m ' + // Strikethrough "STRIKE1"
                'normal ' +
                '\x1b[9mSTRIKE2\x1b[0m' // Strikethrough "STRIKE2" (same style as "STRIKE1")
            );
            await assertPromptInput('STRIKE1 normal STRIKE2|'); // No ghost text expected
        });
        suite('With wrapping', () => {
            test('Fish ghost text in long line with wrapped content', async () => {
                promptInputModel.setShellType("fish" /* PosixShellType.Fish */);
                await writePromise('$ ');
                fireCommandStart();
                await assertPromptInput('|');
                // Write a command with ghost text that will wrap
                await writePromise('find . -name');
                await assertPromptInput(`find . -name|`);
                // Add ghost text with dim style
                await writePromise('\x1b[2m test\x1b[0m\x1b[4D');
                await assertPromptInput(`find . -name |[test]`);
                // Move cursor within the ghost text
                await writePromise('\x1b[C');
                await assertPromptInput(`find . -name t|[est]`);
                // Accept ghost text
                await writePromise('\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C');
                await assertPromptInput(`find . -name test|`);
            });
            test('Pwsh ghost text in long line with wrapped content', async () => {
                promptInputModel.setShellType("pwsh" /* GeneralShellType.PowerShell */);
                await writePromise('$ ');
                fireCommandStart();
                await assertPromptInput('|');
                // Write a command with ghost text that will wrap
                await writePromise('find . -name');
                await assertPromptInput(`find . -name|`);
                // Add ghost text with dim style
                await writePromise('\x1b[2m test\x1b[0m\x1b[4D');
                await assertPromptInput(`find . -name |[test]`);
                // Move cursor within the ghost text
                await writePromise('\x1b[C');
                await assertPromptInput(`find . -name t|[est]`);
                // Accept ghost text
                await writePromise('\x1b[C\x1b[C\x1b[C\x1b[C\x1b[C');
                await assertPromptInput(`find . -name test|`);
            });
        });
        test('Does not detect right prompt as ghost text', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('cmd' + ' '.repeat(6) + '\x1b[38;2;255;0;0mRP\x1b[0m\x1b[8D');
            await assertPromptInput('cmd|' + ' '.repeat(6) + 'RP');
        });
    });
    test('wide input (Korean)', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('안영');
        await assertPromptInput('안영|');
        await writePromise('\r\n컴퓨터');
        await assertPromptInput('안영\n컴퓨터|');
        await writePromise('\r\n사람');
        await assertPromptInput('안영\n컴퓨터\n사람|');
        await writePromise('\x1b[G');
        await assertPromptInput('안영\n컴퓨터\n|사람');
        await writePromise('\x1b[A');
        await assertPromptInput('안영\n|컴퓨터\n사람');
        await writePromise('\x1b[4C');
        await assertPromptInput('안영\n컴퓨|터\n사람');
        await writePromise('\x1b[1;4H');
        await assertPromptInput('안|영\n컴퓨터\n사람');
        await writePromise('\x1b[D');
        await assertPromptInput('|안영\n컴퓨터\n사람');
    });
    test('emoji input', async () => {
        await writePromise('$ ');
        fireCommandStart();
        await assertPromptInput('|');
        await writePromise('✌️👍');
        await assertPromptInput('✌️👍|');
        await writePromise('\r\n😎😕😅');
        await assertPromptInput('✌️👍\n😎😕😅|');
        await writePromise('\r\n🤔🤷😩');
        await assertPromptInput('✌️👍\n😎😕😅\n🤔🤷😩|');
        await writePromise('\x1b[G');
        await assertPromptInput('✌️👍\n😎😕😅\n|🤔🤷😩');
        await writePromise('\x1b[A');
        await assertPromptInput('✌️👍\n|😎😕😅\n🤔🤷😩');
        await writePromise('\x1b[2C');
        await assertPromptInput('✌️👍\n😎😕|😅\n🤔🤷😩');
        await writePromise('\x1b[1;4H');
        await assertPromptInput('✌️|👍\n😎😕😅\n🤔🤷😩');
        await writePromise('\x1b[D');
        await assertPromptInput('|✌️👍\n😎😕😅\n🤔🤷😩');
    });
    suite('trailing whitespace', () => {
        test('cursor index calculation with whitespace', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('echo   ');
            await assertPromptInput('echo   |');
            await writePromise('\x1b[3D');
            await assertPromptInput('echo|   ');
            await writePromise('\x1b[C');
            await assertPromptInput('echo |  ');
            await writePromise('\x1b[C');
            await assertPromptInput('echo  | ');
            await writePromise('\x1b[C');
            await assertPromptInput('echo   |');
        });
        test('cursor index should not exceed command line length', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('cmd');
            await assertPromptInput('cmd|');
            await writePromise('\x1b[10C');
            await assertPromptInput('cmd|');
        });
        test('whitespace preservation in cursor calculation', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('ls   -la');
            await assertPromptInput('ls   -la|');
            await writePromise('\x1b[3D');
            await assertPromptInput('ls   |-la');
            await writePromise('\x1b[3D');
            await assertPromptInput('ls|   -la');
            await writePromise('\x1b[2C');
            await assertPromptInput('ls  | -la');
        });
        test('delete whitespace with backspace', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise(' ');
            await assertPromptInput(` |`);
            xterm.input('\x7F', true); // Backspace
            await writePromise('\x1b[D');
            await assertPromptInput('|');
            xterm.input(' '.repeat(4), true);
            await writePromise(' '.repeat(4));
            await assertPromptInput(`    |`);
            xterm.input('\x1b[D'.repeat(2), true); // Left
            await writePromise('\x1b[2D');
            await assertPromptInput(`  |  `);
            xterm.input('\x7F', true); // Backspace
            await writePromise('\x1b[D');
            await assertPromptInput(` |  `);
            xterm.input('\x7F', true); // Backspace
            await writePromise('\x1b[D');
            await assertPromptInput(`|  `);
            xterm.input(' ', true);
            await writePromise(' ');
            await assertPromptInput(` |  `);
            xterm.input(' ', true);
            await writePromise(' ');
            await assertPromptInput(`  |  `);
            xterm.input('\x1b[C', true); // Right
            await writePromise('\x1b[C');
            await assertPromptInput(`   | `);
            xterm.input('a', true);
            await writePromise('a');
            await assertPromptInput(`   a| `);
            xterm.input('\x7F', true); // Backspace
            await writePromise('\x1b[D\x1b[K');
            await assertPromptInput(`   | `);
            xterm.input('\x1b[D'.repeat(2), true); // Left
            await writePromise('\x1b[2D');
            await assertPromptInput(` |   `);
            xterm.input('\x1b[3~', true); // Delete
            await writePromise('');
            await assertPromptInput(` |  `);
        });
        // TODO: This doesn't work correctly but it doesn't matter too much as it only happens when
        // there is a lot of whitespace at the end of a prompt input
        test.skip('track whitespace when ConPTY deletes whitespace unexpectedly', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            xterm.input('ls', true);
            await writePromise('ls');
            await assertPromptInput(`ls|`);
            xterm.input(' '.repeat(4), true);
            await writePromise(' '.repeat(4));
            await assertPromptInput(`ls    |`);
            xterm.input(' ', true);
            await writePromise('\x1b[4D\x1b[5X\x1b[5C'); // Cursor left x(N-1), delete xN, cursor right xN
            await assertPromptInput(`ls     |`);
        });
        test('track whitespace beyond cursor', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise(' '.repeat(8));
            await assertPromptInput(`${' '.repeat(8)}|`);
            await writePromise('\x1b[4D');
            await assertPromptInput(`${' '.repeat(4)}|${' '.repeat(4)}`);
        });
    });
    suite('multi-line', () => {
        test('basic 2 line', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('echo "a');
            await assertPromptInput(`echo "a|`);
            await writePromise('\n\r\∙ ');
            setContinuationPrompt('∙ ');
            await assertPromptInput(`echo "a\n|`);
            await writePromise('b');
            await assertPromptInput(`echo "a\nb|`);
        });
        test('basic 3 line', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('echo "a');
            await assertPromptInput(`echo "a|`);
            await writePromise('\n\r\∙ ');
            setContinuationPrompt('∙ ');
            await assertPromptInput(`echo "a\n|`);
            await writePromise('b');
            await assertPromptInput(`echo "a\nb|`);
            await writePromise('\n\r\∙ ');
            setContinuationPrompt('∙ ');
            await assertPromptInput(`echo "a\nb\n|`);
            await writePromise('c');
            await assertPromptInput(`echo "a\nb\nc|`);
        });
        test('navigate left in multi-line', async () => {
            return runWithFakedTimers({}, async () => {
                await writePromise('$ ');
                fireCommandStart();
                await assertPromptInput('|');
                await writePromise('echo "a');
                await assertPromptInput(`echo "a|`);
                await writePromise('\n\r\∙ ');
                setContinuationPrompt('∙ ');
                await assertPromptInput(`echo "a\n|`);
                await writePromise('b');
                await assertPromptInput(`echo "a\nb|`);
                await writePromise('\x1b[D');
                await assertPromptInput(`echo "a\n|b`);
                await writePromise('\x1b[@c');
                await assertPromptInput(`echo "a\nc|b`);
                await writePromise('\x1b[K\n\r\∙ ');
                await assertPromptInput(`echo "a\nc\n|`);
                await writePromise('b');
                await assertPromptInput(`echo "a\nc\nb|`);
                await writePromise(' foo');
                await assertPromptInput(`echo "a\nc\nb foo|`);
                await writePromise('\x1b[3D');
                await assertPromptInput(`echo "a\nc\nb |foo`);
            });
        });
        test('navigate up in multi-line', async () => {
            return runWithFakedTimers({}, async () => {
                await writePromise('$ ');
                fireCommandStart();
                await assertPromptInput('|');
                await writePromise('echo "foo');
                await assertPromptInput(`echo "foo|`);
                await writePromise('\n\r\∙ ');
                setContinuationPrompt('∙ ');
                await assertPromptInput(`echo "foo\n|`);
                await writePromise('bar');
                await assertPromptInput(`echo "foo\nbar|`);
                await writePromise('\n\r\∙ ');
                setContinuationPrompt('∙ ');
                await assertPromptInput(`echo "foo\nbar\n|`);
                await writePromise('baz');
                await assertPromptInput(`echo "foo\nbar\nbaz|`);
                await writePromise('\x1b[A');
                await assertPromptInput(`echo "foo\nbar|\nbaz`);
                await writePromise('\x1b[D');
                await assertPromptInput(`echo "foo\nba|r\nbaz`);
                await writePromise('\x1b[D');
                await assertPromptInput(`echo "foo\nb|ar\nbaz`);
                await writePromise('\x1b[D');
                await assertPromptInput(`echo "foo\n|bar\nbaz`);
                await writePromise('\x1b[1;9H');
                await assertPromptInput(`echo "|foo\nbar\nbaz`);
                await writePromise('\x1b[C');
                await assertPromptInput(`echo "f|oo\nbar\nbaz`);
                await writePromise('\x1b[C');
                await assertPromptInput(`echo "fo|o\nbar\nbaz`);
                await writePromise('\x1b[C');
                await assertPromptInput(`echo "foo|\nbar\nbaz`);
            });
        });
        test('navigating up when first line contains invalid/stale trailing whitespace', async () => {
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('echo "foo      \x1b[6D');
            await assertPromptInput(`echo "foo|`);
            await writePromise('\n\r\∙ ');
            setContinuationPrompt('∙ ');
            await assertPromptInput(`echo "foo\n|`);
            await writePromise('bar');
            await assertPromptInput(`echo "foo\nbar|`);
            await writePromise('\x1b[D');
            await assertPromptInput(`echo "foo\nba|r`);
            await writePromise('\x1b[D');
            await assertPromptInput(`echo "foo\nb|ar`);
            await writePromise('\x1b[D');
            await assertPromptInput(`echo "foo\n|bar`);
        });
    });
    suite('multi-line wrapped (no continuation prompt)', () => {
        test('basic wrapped line', async () => {
            return runWithFakedTimers({}, async () => {
                xterm.resize(5, 10);
                await writePromise('$ ');
                fireCommandStart();
                await assertPromptInput('|');
                await writePromise('ech');
                await assertPromptInput(`ech|`);
                await writePromise('o ');
                await assertPromptInput(`echo |`);
                await writePromise('"a"');
                // HACK: Trailing whitespace is due to flaky detection in wrapped lines (but it doesn't matter much)
                await assertPromptInput(`echo "a"| `);
                await writePromise('\n\r\ b');
                await assertPromptInput(`echo "a"\n b|`);
                await writePromise('\n\r\ c');
                await assertPromptInput(`echo "a"\n b\n c|`);
            });
        });
    });
    suite('multi-line wrapped (continuation prompt)', () => {
        test('basic wrapped line', async () => {
            xterm.resize(5, 10);
            promptInputModel.setContinuationPrompt('∙ ');
            await writePromise('$ ');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('ech');
            await assertPromptInput(`ech|`);
            await writePromise('o ');
            await assertPromptInput(`echo |`);
            await writePromise('"a"');
            // HACK: Trailing whitespace is due to flaky detection in wrapped lines (but it doesn't matter much)
            await assertPromptInput(`echo "a"| `);
            await writePromise('\n\r\∙ ');
            await assertPromptInput(`echo "a"\n|`);
            await writePromise('b');
            await assertPromptInput(`echo "a"\nb|`);
            await writePromise('\n\r\∙ ');
            await assertPromptInput(`echo "a"\nb\n|`);
            await writePromise('c');
            await assertPromptInput(`echo "a"\nb\nc|`);
            await writePromise('\n\r\∙ ');
            await assertPromptInput(`echo "a"\nb\nc\n|`);
        });
    });
    suite('multi-line wrapped fish', () => {
        test('forward slash continuation', async () => {
            promptInputModel.setShellType("fish" /* PosixShellType.Fish */);
            await writePromise('$ ');
            await assertPromptInput('|');
            await writePromise('[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>');
            fireCommandStart();
            await writePromise('ech\\');
            await assertPromptInput(`ech\\|`);
            await writePromise('\no bye');
            await assertPromptInput(`echo bye|`);
        });
        test('newline with no continuation', async () => {
            promptInputModel.setShellType("fish" /* PosixShellType.Fish */);
            await writePromise('$ ');
            await assertPromptInput('|');
            await writePromise('[I] meganrogge@Megans-MacBook-Pro ~ (main|BISECTING)>');
            fireCommandStart();
            await assertPromptInput('|');
            await writePromise('echo "hi');
            await assertPromptInput(`echo "hi|`);
            await writePromise('\nand bye\nwhy"');
            await assertPromptInput(`echo "hi\nand bye\nwhy"|`);
        });
    });
    // To "record a session" for these tests:
    // - Enable debug logging
    // - Open and clear Terminal output channel
    // - Open terminal and perform the test
    // - Extract all "parsing data" lines from the terminal
    suite('recorded sessions', () => {
        async function replayEvents(events) {
            for (const data of events) {
                await writePromise(data);
            }
        }
        suite('Windows 11 (10.0.22621.3447), pwsh 7.4.2, starship prompt 1.10.2', () => {
            test('input with ignored ghost text', async () => {
                return runWithFakedTimers({}, async () => {
                    await replayEvents([
                        '[?25l[2J[m[H]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe[?25h',
                        '[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
                        ']633;P;IsWindows=True',
                        ']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
                        ']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
                        '[34m\r\n[38;2;17;17;17m[44m03:13:47 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$⇡ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
                    ]);
                    fireCommandStart();
                    await assertPromptInput('|');
                    await replayEvents([
                        '[?25l[93mf[97m[2m[3makecommand[3;4H[?25h',
                        '[m',
                        '[93mfo[9X',
                        '[m',
                        '[?25l[93m[3;3Hfoo[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('foo|');
                });
            });
            test('input with accepted and run ghost text', async () => {
                return runWithFakedTimers({}, async () => {
                    await replayEvents([
                        '[?25l[2J[m[H]0;C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\\pwsh.exe[?25h',
                        '[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
                        ']633;P;IsWindows=True',
                        ']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
                        ']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
                        '[34m\r\n[38;2;17;17;17m[44m03:41:36 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
                    ]);
                    promptInputModel.setContinuationPrompt('∙ ');
                    fireCommandStart();
                    await assertPromptInput('|');
                    await replayEvents([
                        '[?25l[93me[97m[2m[3mcho "hello world"[3;4H[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('e|[cho "hello world"]');
                    await replayEvents([
                        '[?25l[93mec[97m[2m[3mho "hello world"[3;5H[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('ec|[ho "hello world"]');
                    await replayEvents([
                        '[?25l[93m[3;3Hech[97m[2m[3mo "hello world"[3;6H[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('ech|[o "hello world"]');
                    await replayEvents([
                        '[?25l[93m[3;3Hecho[97m[2m[3m "hello world"[3;7H[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('echo|[ "hello world"]');
                    await replayEvents([
                        '[?25l[93m[3;3Hecho [97m[2m[3m"hello world"[3;8H[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('echo |["hello world"]');
                    await replayEvents([
                        '[?25l[93m[3;3Hecho [36m"hello world"[?25h',
                        '[m',
                    ]);
                    await assertPromptInput('echo "hello world"|');
                    await replayEvents([
                        ']633;E;echo "hello world";ff464d39-bc80-4bae-9ead-b1cafc4adf6f]633;C',
                    ]);
                    fireCommandExecuted();
                    await assertPromptInput('echo "hello world"');
                    await replayEvents([
                        '\r\n',
                        'hello world\r\n',
                    ]);
                    await assertPromptInput('echo "hello world"');
                    await replayEvents([
                        ']633;D;0]633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
                        '[34m\r\n[38;2;17;17;17m[44m03:41:42 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/prompt_input_model [33m[46m [38;2;17;17;17m$ [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
                    ]);
                    fireCommandStart();
                    await assertPromptInput('|');
                });
            });
            test('input, go to start (ctrl+home), delete word in front (ctrl+delete)', async () => {
                return runWithFakedTimers({}, async () => {
                    await replayEvents([
                        '[?25l[2J[m[H]0;C:\Program Files\WindowsApps\Microsoft.PowerShell_7.4.2.0_x64__8wekyb3d8bbwe\pwsh.exe[?25h',
                        '[?25l[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K\r\n[K[H[?25h',
                        ']633;P;IsWindows=True',
                        ']633;P;ContinuationPrompt=\x1b[38\x3b5\x3b8m∙\x1b[0m ',
                        ']633;A]633;P;Cwd=C:\x5cGithub\x5cmicrosoft\x5cvscode]633;B',
                        '[34m\r\n[38;2;17;17;17m[44m16:07:06 [34m[41m [38;2;17;17;17mvscode [31m[43m [38;2;17;17;17m tyriar/210662 [33m[46m [38;2;17;17;17m$! [36m[49m [mvia [32m[1m v18.18.2 \r\n❯[m ',
                    ]);
                    fireCommandStart();
                    await assertPromptInput('|');
                    await replayEvents([
                        '[?25l[93mG[97m[2m[3mit push[3;4H[?25h',
                        '[m',
                        '[?25l[93mGe[97m[2m[3mt-ChildItem -Path a[3;5H[?25h',
                        '[m',
                        '[?25l[93m[3;3HGet[97m[2m[3m-ChildItem -Path a[3;6H[?25h',
                    ]);
                    await assertPromptInput('Get|[-ChildItem -Path a]');
                    await replayEvents([
                        '[m',
                        '[?25l[3;3H[?25h',
                        '[21X',
                    ]);
                    // Don't force a sync, the prompt input model should update by itself
                    await timeout(0);
                    const actualValueWithCursor = promptInputModel.getCombinedString();
                    strictEqual(actualValueWithCursor, '|'.replaceAll('\n', '\u23CE'));
                });
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0SW5wdXRNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vcHJvbXB0SW5wdXRNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQStCLE1BQU0sc0VBQXNFLENBQUM7QUFDckksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVoRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMvRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFL0QsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUM5QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksZ0JBQWtDLENBQUM7SUFDdkMsSUFBSSxLQUFlLENBQUM7SUFDcEIsSUFBSSxjQUF5QyxDQUFDO0lBQzlDLElBQUkscUJBQW9DLENBQUM7SUFDekMsSUFBSSxpQkFBNEMsQ0FBQztJQUNqRCxJQUFJLGlCQUE0QyxDQUFDO0lBRWpELEtBQUssVUFBVSxZQUFZLENBQUMsSUFBWTtR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