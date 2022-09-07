/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal } from 'xterm';
import { strictEqual, deepStrictEqual, deepEqual } from 'assert';
import { timeout } from 'vs/base/common/async';
import * as sinon from 'sinon';
import { parseKeyValueAssignment, parseMarkSequence, ShellIntegrationAddon } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';

async function writeP(terminal: Terminal, data: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const failTimeout = timeout(2000);
		failTimeout.then(() => reject('Writing to xterm is taking longer than 2 seconds'));
		terminal.write(data, () => {
			failTimeout.cancel();
			resolve();
		});
	});
}

class TestShellIntegrationAddon extends ShellIntegrationAddon {
	getCommandDetectionMock(terminal: Terminal): sinon.SinonMock {
		const capability = super._createOrGetCommandDetection(terminal);
		this.capabilities.add(TerminalCapability.CommandDetection, capability);
		return sinon.mock(capability);
	}
	getCwdDectionMock(): sinon.SinonMock {
		const capability = super._createOrGetCwdDetection();
		this.capabilities.add(TerminalCapability.CwdDetection, capability);
		return sinon.mock(capability);
	}
}

suite('ShellIntegrationAddon', () => {
	let xterm: Terminal;
	let shellIntegrationAddon: TestShellIntegrationAddon;
	let capabilities: ITerminalCapabilityStore;

	setup(() => {
		xterm = new Terminal({ allowProposedApi: true, cols: 80, rows: 30 });
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ILogService, NullLogService);
		shellIntegrationAddon = instantiationService.createInstance(TestShellIntegrationAddon, undefined, undefined);
		xterm.loadAddon(shellIntegrationAddon);
		capabilities = shellIntegrationAddon.capabilities;
	});

	suite('cwd detection', async () => {
		test('should activate capability on the cwd sequence (OSC 633 ; P ; Cwd=<cwd> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
		});

		test('should pass cwd sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCwdDectionMock();
			mock.expects('updateCwd').once().withExactArgs('/foo');
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			mock.verify();
		});

		test('detect ITerm sequence: `OSC 1337 ; CurrentDir=<Cwd> ST`', async () => {
			type TestCase = [title: string, input: string, expected: string];
			const cases: TestCase[] = [
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

		suite('detect `SetCwd` sequence: `OSC 7; scheme://cwd ST`', async () => {
			test('should accept well-formatted URLs', async () => {
				type TestCase = [title: string, input: string, expected: string];
				const cases: TestCase[] = [
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
				type TestCase = [title: string, input: string];
				const cases: TestCase[] = [
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
			type TestCase = [title: string, input: string, expected: string];
			const cases: TestCase[] = [
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

	suite('command tracking', async () => {
		test('should activate capability on the prompt start sequence (OSC 633 ; A ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;A\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass prompt start sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handlePromptStart').once().withExactArgs();
			await writeP(xterm, '\x1b]633;A\x07');
			mock.verify();
		});
		test('should activate capability on the command start sequence (OSC 633 ; B ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;B\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command start sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandStart').once().withExactArgs();
			await writeP(xterm, '\x1b]633;B\x07');
			mock.verify();
		});
		test('should activate capability on the command executed sequence (OSC 633 ; C ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;C\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command executed sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandExecuted').once().withExactArgs();
			await writeP(xterm, '\x1b]633;C\x07');
			mock.verify();
		});
		test('should activate capability on the command finished sequence (OSC 633 ; D ; <ExitCode> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;D;7\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
		});
		test('should pass command finished sequence to the capability', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('handleCommandFinished').once().withExactArgs(7);
			await writeP(xterm, '\x1b]633;D;7\x07');
			mock.verify();
		});
		test('should not activate capability on the cwd sequence (OSC 633 ; P=Cwd=<cwd> ST)', async () => {
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
		});
		test('should pass cwd sequence to the capability if it\'s initialized', async () => {
			const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
			mock.expects('setCwd').once().withExactArgs('/foo');
			await writeP(xterm, '\x1b]633;P;Cwd=/foo\x07');
			mock.verify();
		});
	});
	suite('BufferMarkCapability', async () => {
		test('SetMark', async () => {
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, '\x1b]633;SetMark;\x07');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
		});
		test('SetMark - ID', async () => {
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, '\x1b]633;SetMark;1;\x07');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
		});
		test('SetMark - hidden', async () => {
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, '\x1b]633;SetMark;;Hidden\x07');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
		});
		test('SetMark - hidden & ID', async () => {
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, '\x1b]633;SetMark;1;Hidden\x07');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
		});
		test('SetMark - invalid', async () => {
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, 'foo');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
			await writeP(xterm, '\x1b]633;SetMark;;;\x07');
			strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
		});
		suite('parseMarkSequence', () => {
			test('basic', async () => {
				deepEqual(parseMarkSequence(['', '']), { id: undefined, hidden: false });
			});
			test('ID', async () => {
				deepEqual(parseMarkSequence(['Id=3', '']), { id: "3", hidden: false });
			});
			test('hidden', async () => {
				deepEqual(parseMarkSequence(['', 'Hidden']), { id: undefined, hidden: true });
			});
			test('ID + hidden', async () => {
				deepEqual(parseMarkSequence(['Id=4555', 'Hidden']), { id: "4555", hidden: true });
			});
		});
	});
});

test('parseKeyValueAssignment', () => {
	type TestCase = [title: string, input: string, expected: [key: string, value: string | undefined]];
	const cases: TestCase[] = [
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
