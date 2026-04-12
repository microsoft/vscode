/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineAutoApproveAnalyzer } from '../../browser/tools/commandLineAnalyzer/commandLineAutoApproveAnalyzer.js';
suite('CommandLineAutoApproveAnalyzer', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let analyzer;
    setup(() => {
        const configurationService = new TestConfigurationService();
        instantiationService = workbenchInstantiationService({
            configurationService: () => configurationService
        }, store);
        const parser = {
            extractSubCommands: async () => [],
        };
        const telemetry = {
            logPrepare: () => { },
        };
        analyzer = store.add(instantiationService.createInstance(CommandLineAutoApproveAnalyzer, parser, telemetry, () => { }));
    });
    test('should not allow auto approve when sub-command parsing returns an empty list', async () => {
        const options = {
            commandLine: 'rm -- file.txt',
            cwd: undefined,
            shell: 'pwsh',
            os: 1 /* OperatingSystem.Windows */,
            treeSitterLanguage: "powershell" /* TreeSitterCommandParserLanguage.PowerShell */,
            terminalToolSessionId: 'test',
            chatSessionResource: undefined,
        };
        const result = await analyzer.analyze(options);
        strictEqual(result.isAutoApproveAllowed, false);
        strictEqual(result.isAutoApproved, undefined);
        strictEqual(result.disclaimers?.length ?? 0, 0);
    });
    test('should auto approve empty command strings when sub-command parsing returns an empty list', async () => {
        const options = {
            commandLine: '   ',
            cwd: undefined,
            shell: 'pwsh',
            os: 1 /* OperatingSystem.Windows */,
            treeSitterLanguage: "powershell" /* TreeSitterCommandParserLanguage.PowerShell */,
            terminalToolSessionId: 'test',
            chatSessionResource: undefined,
        };
        const result = await analyzer.analyze(options);
        strictEqual(result.isAutoApproveAllowed, true);
        strictEqual(result.isAutoApproved, true);
        strictEqual(result.disclaimers?.length ?? 0, 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVBbmFseXplci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFFckMsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFJM0gsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtJQUM1QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQTJDLENBQUM7SUFDaEQsSUFBSSxRQUF3QyxDQUFDO0lBRTdDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUM1RCxvQkFBb0IsR0FBRyw2QkFBNkIsQ0FBQztZQUNwRCxvQkFBb0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxvQkFBb0I7U0FDaEQsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVWLE1BQU0sTUFBTSxHQUFHO1lBQ2Qsa0JBQWtCLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxFQUFFO1NBQ0ksQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRztZQUNqQixVQUFVLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNvQixDQUFDO1FBRTNDLFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FDdkQsOEJBQThCLEVBQzlCLE1BQU0sRUFDTixTQUFTLEVBQ1QsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUNULENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhFQUE4RSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQy9GLE1BQU0sT0FBTyxHQUFnQztZQUM1QyxXQUFXLEVBQUUsZ0JBQWdCO1lBQzdCLEdBQUcsRUFBRSxTQUFTO1lBQ2QsS0FBSyxFQUFFLE1BQU07WUFDYixFQUFFLGlDQUF5QjtZQUMzQixrQkFBa0IsK0RBQTRDO1lBQzlELHFCQUFxQixFQUFFLE1BQU07WUFDN0IsbUJBQW1CLEVBQUUsU0FBUztTQUM5QixDQUFDO1FBRUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLFdBQVcsQ0FBQyxNQUFNLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEQsV0FBVyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwRkFBMEYsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzRyxNQUFNLE9BQU8sR0FBZ0M7WUFDNUMsV0FBVyxFQUFFLEtBQUs7WUFDbEIsR0FBRyxFQUFFLFNBQVM7WUFDZCxLQUFLLEVBQUUsTUFBTTtZQUNiLEVBQUUsaUNBQXlCO1lBQzNCLGtCQUFrQiwrREFBNEM7WUFDOUQscUJBQXFCLEVBQUUsTUFBTTtZQUM3QixtQkFBbUIsRUFBRSxTQUFTO1NBQzlCLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsV0FBVyxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMvQyxXQUFXLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6QyxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==