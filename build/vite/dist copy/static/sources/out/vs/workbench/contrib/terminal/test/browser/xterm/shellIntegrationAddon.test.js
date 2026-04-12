/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepEqual, deepStrictEqual, strictEqual } from 'assert';
import * as sinon from 'sinon';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { deserializeVSCodeOscMessage, serializeVSCodeOscMessage, parseKeyValueAssignment, parseMarkSequence, ShellIntegrationAddon } from '../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js';
import { writeP } from '../../../browser/terminalTestHelpers.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
class TestShellIntegrationAddon extends ShellIntegrationAddon {
    getCommandDetectionMock(terminal) {
        const capability = super._createOrGetCommandDetection(terminal);
        this.capabilities.add(2 /* TerminalCapability.CommandDetection */, capability);
        return sinon.mock(capability);
    }
    getCwdDectionMock() {
        const capability = super._createOrGetCwdDetection();
        this.capabilities.add(0 /* TerminalCapability.CwdDetection */, capability);
        return sinon.mock(capability);
    }
}
suite('ShellIntegrationAddon', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let xterm;
    let shellIntegrationAddon;
    let capabilities;
    setup(async () => {
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
        shellIntegrationAddon = store.add(new TestShellIntegrationAddon('', true, undefined, undefined, new NullLogService()));
        xterm.loadAddon(shellIntegrationAddon);
        capabilities = shellIntegrationAddon.capabilities;
    });
    suite('cwd detection', () => {
        test('should activate capability on the cwd sequence (OSC 633 ; P ; Cwd=<cwd> ST)', async () => {
            strictEqual(capabilities.has(0 /* TerminalCapability.CwdDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(0 /* TerminalCapability.CwdDetection */), false);
            await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
            strictEqual(capabilities.has(0 /* TerminalCapability.CwdDetection */), true);
        });
        test('should pass cwd sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCwdDectionMock();
            mock.expects('updateCwd').once().withExactArgs('/foo');
            await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
            mock.verify();
        });
        test('detect ITerm sequence: `OSC 1337 ; CurrentDir=<Cwd> ST`', async () => {
            const cases = [
                ['root', '/', '/'],
                ['non-root', '/some/path', '/some/path'],
            ];
            for (const x of cases) {
                const [title, input, expected] = x;
                const mock = shellIntegrationAddon.getCwdDectionMock();
                mock.expects('updateCwd').once().withExactArgs(expected).named(title);
                await writeP(xterm, `\x1b]1337;CurrentDir=${input}\x07`);
                mock.verify();
            }
        });
        suite('detect `SetCwd` sequence: `OSC 7; scheme://cwd ST`', () => {
            test('should accept well-formatted URLs', async () => {
                const cases = [
                    // Different hostname values:
                    ['empty hostname, pointing root', 'file:///', '/'],
                    ['empty hostname', 'file:///test-root/local', '/test-root/local'],
                    ['non-empty hostname', 'file://some-hostname/test-root/local', '/test-root/local'],
                    // URL-encoded chars:
                    ['URL-encoded value (1)', 'file:///test-root/%6c%6f%63%61%6c', '/test-root/local'],
                    ['URL-encoded value (2)', 'file:///test-root/local%22', '/test-root/local"'],
                    ['URL-encoded value (3)', 'file:///test-root/local"', '/test-root/local"'],
                ];
                for (const x of cases) {
                    const [title, input, expected] = x;
                    const mock = shellIntegrationAddon.getCwdDectionMock();
                    mock.expects('updateCwd').once().withExactArgs(expected).named(title);
                    await writeP(xterm, `\x1b]7;${input}\x07`);
                    mock.verify();
                }
            });
            test('should ignore ill-formatted URLs', async () => {
                const cases = [
                    // Different hostname values:
                    ['no hostname, pointing root', 'file://'],
                    // Non-`file` scheme values:
                    ['no scheme (1)', '/test-root'],
                    ['no scheme (2)', '//test-root'],
                    ['no scheme (3)', '///test-root'],
                    ['no scheme (4)', ':///test-root'],
                    ['http', 'http:///test-root'],
                    ['ftp', 'ftp:///test-root'],
                    ['ssh', 'ssh:///test-root'],
                ];
                for (const x of cases) {
                    const [title, input] = x;
                    const mock = shellIntegrationAddon.getCwdDectionMock();
                    mock.expects('updateCwd').never().named(title);
                    await writeP(xterm, `\x1b]7;${input}\x07`);
                    mock.verify();
                }
            });
        });
        test('detect `SetWindowsFrindlyCwd` sequence: `OSC 9 ; 9 ; <cwd> ST`', async () => {
            const cases = [
                ['root', '/', '/'],
                ['non-root', '/some/path', '/some/path'],
            ];
            for (const x of cases) {
                const [title, input, expected] = x;
                const mock = shellIntegrationAddon.getCwdDectionMock();
                mock.expects('updateCwd').once().withExactArgs(expected).named(title);
                await writeP(xterm, `\x1b]9;9;${input}\x07`);
                mock.verify();
            }
        });
    });
    suite('command tracking', () => {
        test('should activate capability on the prompt start sequence (OSC 633 ; A ST)', async () => {
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, '\x1b]633;A\x07');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), true);
        });
        test('should pass prompt start sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('handlePromptStart').once().withExactArgs();
            await writeP(xterm, '\x1b]633;A\x07');
            mock.verify();
        });
        test('should activate capability on the command start sequence (OSC 633 ; B ST)', async () => {
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, '\x1b]633;B\x07');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), true);
        });
        test('should pass command start sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('handleCommandStart').once().withExactArgs();
            await writeP(xterm, '\x1b]633;B\x07');
            mock.verify();
        });
        test('should activate capability on the command executed sequence (OSC 633 ; C ST)', async () => {
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, '\x1b]633;C\x07');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), true);
        });
        test('should pass command executed sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('handleCommandExecuted').once().withExactArgs();
            await writeP(xterm, '\x1b]633;C\x07');
            mock.verify();
        });
        test('should activate capability on the command finished sequence (OSC 633 ; D ; <ExitCode> ST)', async () => {
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, '\x1b]633;D;7\x07');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), true);
        });
        test('should pass command finished sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('handleCommandFinished').once().withExactArgs(7);
            await writeP(xterm, '\x1b]633;D;7\x07');
            mock.verify();
        });
        test('should pass command line sequence to the capability', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('setCommandLine').once().withExactArgs('', false);
            await writeP(xterm, '\x1b]633;E\x07');
            mock.verify();
            const mock2 = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock2.expects('setCommandLine').twice().withExactArgs('cmd', false);
            await writeP(xterm, '\x1b]633;E;cmd\x07');
            await writeP(xterm, '\x1b]633;E;cmd;invalid-nonce\x07');
            mock2.verify();
        });
        test('should not activate capability on the cwd sequence (OSC 633 ; P=Cwd=<cwd> ST)', async () => {
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
            await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
            strictEqual(capabilities.has(2 /* TerminalCapability.CommandDetection */), false);
        });
        test('should pass cwd sequence to the capability if it\'s initialized', async () => {
            const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
            mock.expects('setCwd').once().withExactArgs('/foo');
            await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
            mock.verify();
        });
    });
    suite('BufferMarkCapability', () => {
        test('SetMark', async () => {
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, '\x1b]633;SetMark;\x07');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), true);
        });
        test('SetMark - ID', async () => {
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, '\x1b]633;SetMark;1;\x07');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), true);
        });
        test('SetMark - hidden', async () => {
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, '\x1b]633;SetMark;;Hidden\x07');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), true);
        });
        test('SetMark - hidden & ID', async () => {
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, 'foo');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), false);
            await writeP(xterm, '\x1b]633;SetMark;1;Hidden\x07');
            strictEqual(capabilities.has(4 /* TerminalCapability.BufferMarkDetection */), true);
        });
        suite('parseMarkSequence', () => {
            test('basic', async () => {
                deepEqual(parseMarkSequence(['', '']), { id: undefined, hidden: false });
            });
            test('ID', async () => {
                deepEqual(parseMarkSequence(['Id=3', '']), { id: '3', hidden: false });
            });
            test('hidden', async () => {
                deepEqual(parseMarkSequence(['', 'Hidden']), { id: undefined, hidden: true });
            });
            test('ID + hidden', async () => {
                deepEqual(parseMarkSequence(['Id=4555', 'Hidden']), { id: '4555', hidden: true });
            });
        });
    });
    suite('deserializeMessage', () => {
        // A single literal backslash, in order to avoid confusion about whether we are escaping test data or testing escapes.
        const Backslash = '\\';
        const Newline = '\n';
        const Semicolon = ';';
        const cases = [
            ['empty', '', ''],
            ['basic', 'value', 'value'],
            ['space', 'some thing', 'some thing'],
            ['escaped backslash', `${Backslash}${Backslash}`, Backslash],
            ['non-initial escaped backslash', `foo${Backslash}${Backslash}`, `foo${Backslash}`],
            ['two escaped backslashes', `${Backslash}${Backslash}${Backslash}${Backslash}`, `${Backslash}${Backslash}`],
            ['escaped backslash amidst text', `Hello${Backslash}${Backslash}there`, `Hello${Backslash}there`],
            ['backslash escaped literally and as hex', `${Backslash}${Backslash} is same as ${Backslash}x5c`, `${Backslash} is same as ${Backslash}`],
            ['escaped semicolon', `${Backslash}x3b`, Semicolon],
            ['non-initial escaped semicolon', `foo${Backslash}x3b`, `foo${Semicolon}`],
            ['escaped semicolon (upper hex)', `${Backslash}x3B`, Semicolon],
            ['escaped backslash followed by literal "x3b" is not a semicolon', `${Backslash}${Backslash}x3b`, `${Backslash}x3b`],
            ['non-initial escaped backslash followed by literal "x3b" is not a semicolon', `foo${Backslash}${Backslash}x3b`, `foo${Backslash}x3b`],
            ['escaped backslash followed by escaped semicolon', `${Backslash}${Backslash}${Backslash}x3b`, `${Backslash}${Semicolon}`],
            ['escaped semicolon amidst text', `some${Backslash}x3bthing`, `some${Semicolon}thing`],
            ['escaped newline', `${Backslash}x0a`, Newline],
            ['non-initial escaped newline', `foo${Backslash}x0a`, `foo${Newline}`],
            ['escaped newline (upper hex)', `${Backslash}x0A`, Newline],
            ['escaped backslash followed by literal "x0a" is not a newline', `${Backslash}${Backslash}x0a`, `${Backslash}x0a`],
            ['non-initial escaped backslash followed by literal "x0a" is not a newline', `foo${Backslash}${Backslash}x0a`, `foo${Backslash}x0a`],
            ['PS1 simple', '[\\u@\\h \\W]\\$', '[\\u@\\h \\W]\\$'],
            ['PS1 VSC SI', `${Backslash}x1b]633;A${Backslash}x07\\[${Backslash}x1b]0;\\u@\\h:\\w\\a\\]${Backslash}x1b]633;B${Backslash}x07`, '\x1b]633;A\x07\\[\x1b]0;\\u@\\h:\\w\\a\\]\x1b]633;B\x07']
        ];
        cases.forEach(([title, input, expected]) => {
            test(title, () => strictEqual(deserializeVSCodeOscMessage(input), expected));
        });
    });
    suite('serializeVSCodeOscMessage', () => {
        // A single literal backslash, in order to avoid confusion about whether we are escaping test data or testing escapes.
        const Backslash = '\\';
        const Newline = '\n';
        const Semicolon = ';';
        const cases = [
            ['empty', '', ''],
            ['basic', 'value', 'value'],
            ['space', 'some thing', `some${Backslash}x20thing`],
            ['backslash', Backslash, `${Backslash}${Backslash}`],
            ['non-initial backslash', `foo${Backslash}`, `foo${Backslash}${Backslash}`],
            ['two backslashes', `${Backslash}${Backslash}`, `${Backslash}${Backslash}${Backslash}${Backslash}`],
            ['backslash amidst text', `Hello${Backslash}there`, `Hello${Backslash}${Backslash}there`],
            ['semicolon', Semicolon, `${Backslash}x3b`],
            ['non-initial semicolon', `foo${Semicolon}`, `foo${Backslash}x3b`],
            ['semicolon amidst text', `some${Semicolon}thing`, `some${Backslash}x3bthing`],
            ['newline', Newline, `${Backslash}x0a`],
            ['non-initial newline', `foo${Newline}`, `foo${Backslash}x0a`],
            ['newline amidst text', `some${Newline}thing`, `some${Backslash}x0athing`],
            ['tab character', '\t', `${Backslash}x09`],
            ['carriage return', '\r', `${Backslash}x0d`],
            ['null character', '\x00', `${Backslash}x00`],
            ['space character (0x20)', ' ', `${Backslash}x20`],
            ['character above 0x20', '!', '!'],
            ['multiple special chars', `hello${Newline}world${Semicolon}test${Backslash}end`, `hello${Backslash}x0aworld${Backslash}x3btest${Backslash}${Backslash}end`],
            ['PS1 with escape sequences', `\x1b]633;A\x07\\[\x1b]0;\\u@\\h:\\w\\a\\]\x1b]633;B\x07`, `${Backslash}x1b]633${Backslash}x3bA${Backslash}x07${Backslash}${Backslash}[${Backslash}x1b]0${Backslash}x3b${Backslash}${Backslash}u@${Backslash}${Backslash}h:${Backslash}${Backslash}w${Backslash}${Backslash}a${Backslash}${Backslash}]${Backslash}x1b]633${Backslash}x3bB${Backslash}x07`]
        ];
        cases.forEach(([title, input, expected]) => {
            test(title, () => strictEqual(serializeVSCodeOscMessage(input), expected));
        });
    });
    test('parseKeyValueAssignment', () => {
        const cases = [
            ['empty', '', ['', undefined]],
            ['no "=" sign', 'some-text', ['some-text', undefined]],
            ['empty value', 'key=', ['key', '']],
            ['empty key', '=value', ['', 'value']],
            ['normal', 'key=value', ['key', 'value']],
            ['multiple "=" signs (1)', 'key==value', ['key', '=value']],
            ['multiple "=" signs (2)', 'key=value===true', ['key', 'value===true']],
            ['just a "="', '=', ['', '']],
            ['just a "=="', '==', ['', '=']],
        ];
        cases.forEach(x => {
            const [title, input, [key, value]] = x;
            deepStrictEqual(parseKeyValueAssignment(input), { key, value }, title);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hlbGxJbnRlZ3JhdGlvbkFkZG9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIveHRlcm0vc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUseUJBQXlCLEVBQUUsdUJBQXVCLEVBQUUsaUJBQWlCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUN0TixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXpHLE1BQU0seUJBQTBCLFNBQVEscUJBQXFCO0lBQzVELHVCQUF1QixDQUFDLFFBQWtCO1FBQ3pDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsOENBQXNDLFVBQVUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBQ0QsaUJBQWlCO1FBQ2hCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ3BELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRywwQ0FBa0MsVUFBVSxDQUFDLENBQUM7UUFDbkUsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQy9CLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7SUFDbkMsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLEtBQWUsQ0FBQztJQUNwQixJQUFJLHFCQUFnRCxDQUFDO0lBQ3JELElBQUksWUFBc0MsQ0FBQztJQUUzQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUFnQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDekgsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxZQUFZLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0cscUJBQXFCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHlCQUF5QixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2SCxLQUFLLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDdkMsWUFBWSxHQUFHLHFCQUFxQixDQUFDLFlBQVksQ0FBQztJQUNuRCxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzNCLElBQUksQ0FBQyw2RUFBNkUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUM5RixXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcseUNBQWlDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEUsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNCLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyx5Q0FBaUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUMvQyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcseUNBQWlDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEUsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDN0QsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN2RCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2RCxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUUxRSxNQUFNLEtBQUssR0FBZTtnQkFDekIsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztnQkFDbEIsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLFlBQVksQ0FBQzthQUN4QyxDQUFDO1lBQ0YsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNuQyxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2dCQUN2RCxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3RFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSx3QkFBd0IsS0FBSyxNQUFNLENBQUMsQ0FBQztnQkFDekQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxJQUFJLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBRXBELE1BQU0sS0FBSyxHQUFlO29CQUN6Qiw2QkFBNkI7b0JBQzdCLENBQUMsK0JBQStCLEVBQUUsVUFBVSxFQUFFLEdBQUcsQ0FBQztvQkFDbEQsQ0FBQyxnQkFBZ0IsRUFBRSx5QkFBeUIsRUFBRSxrQkFBa0IsQ0FBQztvQkFDakUsQ0FBQyxvQkFBb0IsRUFBRSxzQ0FBc0MsRUFBRSxrQkFBa0IsQ0FBQztvQkFDbEYscUJBQXFCO29CQUNyQixDQUFDLHVCQUF1QixFQUFFLG1DQUFtQyxFQUFFLGtCQUFrQixDQUFDO29CQUNsRixDQUFDLHVCQUF1QixFQUFFLDRCQUE0QixFQUFFLG1CQUFtQixDQUFDO29CQUM1RSxDQUFDLHVCQUF1QixFQUFFLDBCQUEwQixFQUFFLG1CQUFtQixDQUFDO2lCQUMxRSxDQUFDO2dCQUNGLEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUM7b0JBQ3ZCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDbkMsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN0RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsVUFBVSxLQUFLLE1BQU0sQ0FBQyxDQUFDO29CQUMzQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2YsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGtDQUFrQyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUVuRCxNQUFNLEtBQUssR0FBZTtvQkFDekIsNkJBQTZCO29CQUM3QixDQUFDLDRCQUE0QixFQUFFLFNBQVMsQ0FBQztvQkFDekMsNEJBQTRCO29CQUM1QixDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUM7b0JBQy9CLENBQUMsZUFBZSxFQUFFLGFBQWEsQ0FBQztvQkFDaEMsQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDO29CQUNqQyxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUM7b0JBQ2xDLENBQUMsTUFBTSxFQUFFLG1CQUFtQixDQUFDO29CQUM3QixDQUFDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQztvQkFDM0IsQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLENBQUM7aUJBQzNCLENBQUM7Z0JBRUYsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3pCLE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFLENBQUM7b0JBQ3ZELElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUMvQyxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsVUFBVSxLQUFLLE1BQU0sQ0FBQyxDQUFDO29CQUMzQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2YsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0VBQWdFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFFakYsTUFBTSxLQUFLLEdBQWU7Z0JBQ3pCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7Z0JBQ2xCLENBQUMsVUFBVSxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUM7YUFDeEMsQ0FBQztZQUNGLEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDbkMsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN0RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsWUFBWSxLQUFLLE1BQU0sQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsSUFBSSxDQUFDLDBFQUEwRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzNGLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0IsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3RDLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRSxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxxREFBcUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN0RSxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsRSxJQUFJLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDekQsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDdEMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsMkVBQTJFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDNUYsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQixXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsNkNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUUsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDdEMsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3ZFLE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUMxRCxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUN0QyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyw4RUFBOEUsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMvRixXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsNkNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUUsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNCLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztZQUN0QyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsNkNBQXFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMseURBQXlELEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDMUUsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzdELE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLDJGQUEyRixFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVHLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0IsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3hDLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxRSxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxRSxNQUFNLElBQUksR0FBRyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsRSxJQUFJLENBQUMsT0FBTyxDQUFDLHVCQUF1QixDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlELE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3RFLE1BQU0sSUFBSSxHQUFHLHFCQUFxQixDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQy9ELE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUVkLE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25FLEtBQUssQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3BFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1lBQzFDLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO1lBQ3hELEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNoQixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQywrRUFBK0UsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNoRyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsNkNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDMUUsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNCLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUMvQyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsNkNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0UsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDbEYsTUFBTSxJQUFJLEdBQUcscUJBQXFCLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEQsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLHlCQUF5QixDQUFDLENBQUM7WUFDL0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDbEMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLElBQUksRUFBRTtZQUMxQixXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0RBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0UsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNCLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyxnREFBd0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUM3QyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0RBQXdDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQy9CLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyxnREFBd0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0IsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLGdEQUF3QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1lBQy9DLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyxnREFBd0MsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNuQyxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0RBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0UsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNCLFdBQVcsQ0FBQyxZQUFZLENBQUMsR0FBRyxnREFBd0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM3RSxNQUFNLE1BQU0sQ0FBQyxLQUFLLEVBQUUsOEJBQThCLENBQUMsQ0FBQztZQUNwRCxXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0RBQXdDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEMsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLGdEQUF3QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdFLE1BQU0sTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQixXQUFXLENBQUMsWUFBWSxDQUFDLEdBQUcsZ0RBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0UsTUFBTSxNQUFNLENBQUMsS0FBSyxFQUFFLCtCQUErQixDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLGdEQUF3QyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtZQUMvQixJQUFJLENBQUMsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN4QixTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDMUUsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNyQixTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDeEUsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUN6QixTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDL0UsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUM5QixTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbkYsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtRQUNoQyxzSEFBc0g7UUFDdEgsTUFBTSxTQUFTLEdBQUcsSUFBYSxDQUFDO1FBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQWEsQ0FBQztRQUM5QixNQUFNLFNBQVMsR0FBRyxHQUFZLENBQUM7UUFHL0IsTUFBTSxLQUFLLEdBQWU7WUFDekIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNqQixDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDO1lBQzNCLENBQUMsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLENBQUM7WUFDckMsQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsRUFBRSxTQUFTLENBQUM7WUFDNUQsQ0FBQywrQkFBK0IsRUFBRSxNQUFNLFNBQVMsR0FBRyxTQUFTLEVBQUUsRUFBRSxNQUFNLFNBQVMsRUFBRSxDQUFDO1lBQ25GLENBQUMseUJBQXlCLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsRUFBRSxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsQ0FBQztZQUMzRyxDQUFDLCtCQUErQixFQUFFLFFBQVEsU0FBUyxHQUFHLFNBQVMsT0FBTyxFQUFFLFFBQVEsU0FBUyxPQUFPLENBQUM7WUFDakcsQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLFNBQVMsR0FBRyxTQUFTLGVBQWUsU0FBUyxLQUFLLEVBQUUsR0FBRyxTQUFTLGVBQWUsU0FBUyxFQUFFLENBQUM7WUFDekksQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLFNBQVMsS0FBSyxFQUFFLFNBQVMsQ0FBQztZQUNuRCxDQUFDLCtCQUErQixFQUFFLE1BQU0sU0FBUyxLQUFLLEVBQUUsTUFBTSxTQUFTLEVBQUUsQ0FBQztZQUMxRSxDQUFDLCtCQUErQixFQUFFLEdBQUcsU0FBUyxLQUFLLEVBQUUsU0FBUyxDQUFDO1lBQy9ELENBQUMsZ0VBQWdFLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxLQUFLLEVBQUUsR0FBRyxTQUFTLEtBQUssQ0FBQztZQUNwSCxDQUFDLDRFQUE0RSxFQUFFLE1BQU0sU0FBUyxHQUFHLFNBQVMsS0FBSyxFQUFFLE1BQU0sU0FBUyxLQUFLLENBQUM7WUFDdEksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLFNBQVMsR0FBRyxTQUFTLEdBQUcsU0FBUyxLQUFLLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxFQUFFLENBQUM7WUFDMUgsQ0FBQywrQkFBK0IsRUFBRSxPQUFPLFNBQVMsVUFBVSxFQUFFLE9BQU8sU0FBUyxPQUFPLENBQUM7WUFDdEYsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLFNBQVMsS0FBSyxFQUFFLE9BQU8sQ0FBQztZQUMvQyxDQUFDLDZCQUE2QixFQUFFLE1BQU0sU0FBUyxLQUFLLEVBQUUsTUFBTSxPQUFPLEVBQUUsQ0FBQztZQUN0RSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsU0FBUyxLQUFLLEVBQUUsT0FBTyxDQUFDO1lBQzNELENBQUMsOERBQThELEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxLQUFLLEVBQUUsR0FBRyxTQUFTLEtBQUssQ0FBQztZQUNsSCxDQUFDLDBFQUEwRSxFQUFFLE1BQU0sU0FBUyxHQUFHLFNBQVMsS0FBSyxFQUFFLE1BQU0sU0FBUyxLQUFLLENBQUM7WUFDcEksQ0FBQyxZQUFZLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLENBQUM7WUFDdEQsQ0FBQyxZQUFZLEVBQUUsR0FBRyxTQUFTLFlBQVksU0FBUyxTQUFTLFNBQVMsMEJBQTBCLFNBQVMsWUFBWSxTQUFTLEtBQUssRUFBRSx5REFBeUQsQ0FBQztTQUMzTCxDQUFDO1FBRUYsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFO1lBQzFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDOUUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsc0hBQXNIO1FBQ3RILE1BQU0sU0FBUyxHQUFHLElBQWEsQ0FBQztRQUNoQyxNQUFNLE9BQU8sR0FBRyxJQUFhLENBQUM7UUFDOUIsTUFBTSxTQUFTLEdBQUcsR0FBWSxDQUFDO1FBRy9CLE1BQU0sS0FBSyxHQUFlO1lBQ3pCLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDakIsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQztZQUMzQixDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsT0FBTyxTQUFTLFVBQVUsQ0FBQztZQUNuRCxDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxFQUFFLENBQUM7WUFDcEQsQ0FBQyx1QkFBdUIsRUFBRSxNQUFNLFNBQVMsRUFBRSxFQUFFLE1BQU0sU0FBUyxHQUFHLFNBQVMsRUFBRSxDQUFDO1lBQzNFLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxFQUFFLEVBQUUsR0FBRyxTQUFTLEdBQUcsU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTLEVBQUUsQ0FBQztZQUNuRyxDQUFDLHVCQUF1QixFQUFFLFFBQVEsU0FBUyxPQUFPLEVBQUUsUUFBUSxTQUFTLEdBQUcsU0FBUyxPQUFPLENBQUM7WUFDekYsQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLEdBQUcsU0FBUyxLQUFLLENBQUM7WUFDM0MsQ0FBQyx1QkFBdUIsRUFBRSxNQUFNLFNBQVMsRUFBRSxFQUFFLE1BQU0sU0FBUyxLQUFLLENBQUM7WUFDbEUsQ0FBQyx1QkFBdUIsRUFBRSxPQUFPLFNBQVMsT0FBTyxFQUFFLE9BQU8sU0FBUyxVQUFVLENBQUM7WUFDOUUsQ0FBQyxTQUFTLEVBQUUsT0FBTyxFQUFFLEdBQUcsU0FBUyxLQUFLLENBQUM7WUFDdkMsQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLE9BQU8sRUFBRSxFQUFFLE1BQU0sU0FBUyxLQUFLLENBQUM7WUFDOUQsQ0FBQyxxQkFBcUIsRUFBRSxPQUFPLE9BQU8sT0FBTyxFQUFFLE9BQU8sU0FBUyxVQUFVLENBQUM7WUFDMUUsQ0FBQyxlQUFlLEVBQUUsSUFBSSxFQUFFLEdBQUcsU0FBUyxLQUFLLENBQUM7WUFDMUMsQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsR0FBRyxTQUFTLEtBQUssQ0FBQztZQUM1QyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxHQUFHLFNBQVMsS0FBSyxDQUFDO1lBQzdDLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFLEdBQUcsU0FBUyxLQUFLLENBQUM7WUFDbEQsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ2xDLENBQUMsd0JBQXdCLEVBQUUsUUFBUSxPQUFPLFFBQVEsU0FBUyxPQUFPLFNBQVMsS0FBSyxFQUFFLFFBQVEsU0FBUyxXQUFXLFNBQVMsVUFBVSxTQUFTLEdBQUcsU0FBUyxLQUFLLENBQUM7WUFDNUosQ0FBQywyQkFBMkIsRUFBRSx5REFBeUQsRUFBRSxHQUFHLFNBQVMsVUFBVSxTQUFTLE9BQU8sU0FBUyxNQUFNLFNBQVMsR0FBRyxTQUFTLElBQUksU0FBUyxRQUFRLFNBQVMsTUFBTSxTQUFTLEdBQUcsU0FBUyxLQUFLLFNBQVMsR0FBRyxTQUFTLEtBQUssU0FBUyxHQUFHLFNBQVMsSUFBSSxTQUFTLEdBQUcsU0FBUyxJQUFJLFNBQVMsR0FBRyxTQUFTLElBQUksU0FBUyxVQUFVLFNBQVMsT0FBTyxTQUFTLEtBQUssQ0FBQztTQUN4WCxDQUFDO1FBRUYsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFO1lBQzFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDNUUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFFcEMsTUFBTSxLQUFLLEdBQWU7WUFDekIsQ0FBQyxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzlCLENBQUMsYUFBYSxFQUFFLFdBQVcsRUFBRSxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN0RCxDQUFDLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDcEMsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3RDLENBQUMsUUFBUSxFQUFFLFdBQVcsRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztZQUN6QyxDQUFDLHdCQUF3QixFQUFFLFlBQVksRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMzRCxDQUFDLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3ZFLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM3QixDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDaEMsQ0FBQztRQUVGLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDakIsTUFBTSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdkMsZUFBZSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hFLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9