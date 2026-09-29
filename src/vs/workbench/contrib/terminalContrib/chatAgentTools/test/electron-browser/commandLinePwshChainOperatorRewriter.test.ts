/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { CommandLinePwshChainOperatorRewriter } from '../../browser/tools/commandLineRewriter/commandLinePwshChainOperatorRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';
import { TreeSitterCommandParser } from '../../browser/treeSitterCommandParser.js';

suite('CommandLinePwshChainOperatorRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;
	let rewriter: CommandLinePwshChainOperatorRewriter;

	function createRewriteOptions(command: string, shell: string, os: OperatingSystem): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd: undefined,
			shell,
			os
		};
	}

	setup(() => {
		const fileService = store.add(new FileService(new NullLogService()));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
		}, store);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		parser = store.add(instantiationService.createInstance(TreeSitterCommandParser));
		rewriter = store.add(instantiationService.createInstance(CommandLinePwshChainOperatorRewriter, parser));
	});

	suite('PowerShell: && -> ;', () => {
		async function t(originalCommandLine: string, expectedResult: string | undefined) {
			const options = createRewriteOptions(originalCommandLine, 'pwsh', OperatingSystem.Windows);
			const result = await rewriter.rewrite(options);
			strictEqual(result?.rewritten, expectedResult);
			if (expectedResult !== undefined) {
				strictEqual(result?.reasoning, '&& re-written to ;');
			}
		}

		test('should rewrite && to ; in PowerShell commands', () => t('echo hello && echo world', 'echo hello ; echo world'));
		test('should rewrite multiple && to ; in PowerShell commands', () => t('echo first && echo second && echo third', 'echo first ; echo second ; echo third'));
		test('should handle complex commands with && operators', () => t('npm install && npm test && echo "build complete"', 'npm install ; npm test ; echo "build complete"'));
		test('should work with Windows PowerShell shell identifier', () => t('Get-Process && Stop-Process', 'Get-Process ; Stop-Process'));
		test('should preserve existing semicolons', () => t('echo hello; echo world && echo final', 'echo hello; echo world ; echo final'));
		test('should not rewrite strings', () => t('echo "&&" && Write-Host "&& &&" && "&&"', 'echo "&&" ; Write-Host "&& &&" ; "&&"'));
	});
});
