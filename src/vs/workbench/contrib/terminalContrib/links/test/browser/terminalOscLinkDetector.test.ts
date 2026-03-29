/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import type { IBufferLine, Terminal } from '@xterm/xterm';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TerminalLinkResolver } from '../../browser/terminalLinkResolver.js';
import { TerminalOscLinkDetector } from '../../browser/terminalOscLinkDetector.js';
import { TerminalBuiltinLinkType } from '../../browser/links.js';
import { IFileService, IFileStatWithPartialMetadata } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';

class TestFileService extends FileService {
	private _files: URI[] = [];
	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		if (this._files.some(e => e.toString() === resource.toString())) {
			return { isFile: true, isDirectory: false, isSymbolicLink: false } as IFileStatWithPartialMetadata;
		}
		throw new Error('ENOENT');
	}
	setFiles(files: URI[]): void {
		this._files = files;
	}
}

suite('Workbench - TerminalOscLinkDetector', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let detector: TerminalOscLinkDetector;
	let xterm: Terminal;
	let fileService: TestFileService;
	let validResources: URI[] = [];

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());
		fileService = store.add(new TestFileService(new NullLogService()));
		fileService.setFiles(validResources);
		instantiationService.set(IFileService, fileService);
		instantiationService.set(IWorkspaceContextService, new TestContextService());
		instantiationService.set(IUriIdentityService, store.add(new UriIdentityService(fileService)));
		instantiationService.stub(ITerminalLogService, new NullLogService());

		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
		detector = instantiationService.createInstance(TerminalOscLinkDetector, xterm, {
			initialCwd: '/parent/cwd',
			os: OperatingSystem.Linux,
			remoteAuthority: undefined,
			userHome: '/home',
			backend: undefined
		}, instantiationService.createInstance(TerminalLinkResolver));
	});

	teardown(() => {
		instantiationService.dispose();
	});

	function oscLink(uri: string, text: string): string {
		return `\u001b]8;;${uri}\u0007${text}\u001b]8;;\u0007`;
	}

	async function detectLinks(text: string) {
		xterm.reset();
		await new Promise<void>(resolve => xterm.write(text, resolve));
		const lines: IBufferLine[] = [];
		for (let i = 0; i < xterm.buffer.active.cursorY + 1; i++) {
			lines.push(xterm.buffer.active.getLine(i)!);
		}
		return detector.detect(lines, 0, xterm.buffer.active.cursorY);
	}

	test('detects file scheme OSC link with display text', async () => {
		validResources = [URI.file('/etc/passwd')];
		fileService.setFiles(validResources);
		const links = await detectLinks(oscLink('file:///etc/passwd', 'passwd'));
		strictEqual(links.length, 1);
		strictEqual(links[0].type, TerminalBuiltinLinkType.LocalFile);
		strictEqual(links[0].text, 'passwd');
		strictEqual(links[0].uri?.toString(), 'file:///etc/passwd');
		strictEqual(links[0].bufferRange.start.x, 1);
		strictEqual(links[0].bufferRange.start.y, 1);
		strictEqual(links[0].bufferRange.end.x, 6);
		strictEqual(links[0].bufferRange.end.y, 1);
	});

	test('detects https OSC link as url type', async () => {
		const links = await detectLinks(oscLink('https://example.com', 'example'));
		strictEqual(links.length, 1);
		strictEqual(links[0].type, TerminalBuiltinLinkType.Url);
		strictEqual(links[0].text, 'example');
		strictEqual(links[0].uri?.toString(), 'https://example.com/');
		strictEqual(links[0].bufferRange.start.x, 1);
		strictEqual(links[0].bufferRange.start.y, 1);
		strictEqual(links[0].bufferRange.end.x, 7);
		strictEqual(links[0].bufferRange.end.y, 1);
	});
});
