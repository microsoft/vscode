/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineCdPrefixRewriter } from '../../browser/tools/commandLineRewriter/commandLineCdPrefixRewriter.js';
suite('CommandLineCdPrefixRewriter', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let rewriter;
    function createRewriteOptions(command, cwd, shell, os) {
        return {
            commandLine: command,
            cwd,
            shell,
            os
        };
    }
    setup(() => {
        instantiationService = workbenchInstantiationService({}, store);
        rewriter = store.add(instantiationService.createInstance(CommandLineCdPrefixRewriter));
    });
    suite('cd <cwd> && <suffix> -> <suffix>', () => {
        (!isWindows ? suite : suite.skip)('Posix', () => {
            const cwd = URI.file('/test/workspace');
            function t(commandLine, shell, expectedResult) {
                const options = createRewriteOptions(commandLine, cwd, shell, 3 /* OperatingSystem.Linux */);
                const result = rewriter.rewrite(options);
                strictEqual(result?.rewritten, expectedResult);
                if (expectedResult !== undefined) {
                    strictEqual(result?.reasoning, 'Removed redundant cd command');
                }
            }
            test('should return undefined when no cd prefix pattern matches', () => t('echo hello world', 'bash', undefined));
            test('should return undefined when cd pattern does not have suffix', () => t('cd /some/path', 'bash', undefined));
            test('should rewrite command with ; separator when directory matches cwd', () => t('cd /test/workspace; npm test', 'pwsh', 'npm test'));
            test('should rewrite command with && separator when directory matches cwd', () => t('cd /test/workspace && npm install', 'bash', 'npm install'));
            test('should rewrite command when the path is wrapped in double quotes', () => t('cd "/test/workspace" && npm install', 'bash', 'npm install'));
            test('should not rewrite command when directory does not match cwd', () => t('cd /different/path && npm install', 'bash', undefined));
            test('should handle commands with complex suffixes', () => t('cd /test/workspace && npm install && npm test && echo "done"', 'bash', 'npm install && npm test && echo "done"'));
            test('should ignore any trailing forward slash', () => t('cd /test/workspace/ && npm install', 'bash', 'npm install'));
        });
        (isWindows ? suite : suite.skip)('Windows', () => {
            const cwd = URI.file('C:\\test\\workspace');
            function t(commandLine, shell, expectedResult) {
                const options = createRewriteOptions(commandLine, cwd, shell, 1 /* OperatingSystem.Windows */);
                const result = rewriter.rewrite(options);
                strictEqual(result?.rewritten, expectedResult);
                if (expectedResult !== undefined) {
                    strictEqual(result?.reasoning, 'Removed redundant cd command');
                }
            }
            test('should ignore any trailing back slash', () => t('cd c:\\test\\workspace\\ && npm install', 'cmd', 'npm install'));
            test('should rewrite command with && separator when directory matches cwd', () => t('cd C:\\test\\workspace && npm test', 'cmd', 'npm test'));
            test('should rewrite command with ; separator when directory matches cwd - PowerShell style', () => t('cd C:\\test\\workspace; npm test', 'pwsh', 'npm test'));
            test('should not rewrite when cwd differs from cd path', () => t('cd C:\\different\\path && npm test', 'cmd', undefined));
            test('should handle case-insensitive comparison on Windows', () => t('cd c:\\test\\workspace && npm test', 'cmd', 'npm test'));
            test('should handle quoted paths', () => t('cd "C:\\test\\workspace" && npm test', 'cmd', 'npm test'));
            test('should handle cd /d flag when directory matches cwd', () => t('cd /d C:\\test\\workspace && echo hello', 'pwsh', 'echo hello'));
            test('should handle cd /d flag with quoted paths when directory matches cwd', () => t('cd /d "C:\\test\\workspace" && echo hello', 'pwsh', 'echo hello'));
            test('should not rewrite cd /d when directory does not match cwd', () => t('cd /d C:\\different\\path ; echo hello', 'pwsh', undefined));
            test('should handle cd /d flag with semicolon separator', () => t('cd /d C:\\test\\workspace; echo hello', 'pwsh', 'echo hello'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVDZFByZWZpeFJld3JpdGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9lbGVjdHJvbi1icm93c2VyL2NvbW1hbmRMaW5lQ2RQcmVmaXhSZXdyaXRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLFNBQVMsRUFBbUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFHckgsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxRQUFxQyxDQUFDO0lBRTFDLFNBQVMsb0JBQW9CLENBQUMsT0FBZSxFQUFFLEdBQW9CLEVBQUUsS0FBYSxFQUFFLEVBQW1CO1FBQ3RHLE9BQU87WUFDTixXQUFXLEVBQUUsT0FBTztZQUNwQixHQUFHO1lBQ0gsS0FBSztZQUNMLEVBQUU7U0FDRixDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEUsUUFBUSxHQUFHLEtBQUss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