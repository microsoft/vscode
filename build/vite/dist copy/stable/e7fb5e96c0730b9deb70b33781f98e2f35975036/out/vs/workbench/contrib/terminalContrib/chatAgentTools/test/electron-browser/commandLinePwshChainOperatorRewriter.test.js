/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { CommandLinePwshChainOperatorRewriter } from '../../browser/tools/commandLineRewriter/commandLinePwshChainOperatorRewriter.js';
import { TreeSitterCommandParser } from '../../browser/treeSitterCommandParser.js';
suite('CommandLinePwshChainOperatorRewriter', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let parser;
    let rewriter;
    function createRewriteOptions(command, shell, os) {
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
        async function t(originalCommandLine, expectedResult) {
            const options = createRewriteOptions(originalCommandLine, 'pwsh', 1 /* OperatingSystem.Windows */);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVQd3NoQ2hhaW5PcGVyYXRvclJld3JpdGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9lbGVjdHJvbi1icm93c2VyL2NvbW1hbmRMaW5lUHdzaENoYWluT3BlcmF0b3JSZXdyaXRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlGQUFpRixDQUFDO0FBQzVILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUVyRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDbEgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDMUcsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0saUZBQWlGLENBQUM7QUFFdkksT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkYsS0FBSyxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtJQUNsRCxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxNQUErQixDQUFDO0lB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