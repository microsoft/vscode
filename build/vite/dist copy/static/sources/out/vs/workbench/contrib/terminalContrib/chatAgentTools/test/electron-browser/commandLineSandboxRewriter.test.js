/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual, deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineSandboxRewriter } from '../../browser/tools/commandLineRewriter/commandLineSandboxRewriter.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
suite('CommandLineSandboxRewriter', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    const stubSandboxService = (overrides = {}) => {
        instantiationService = workbenchInstantiationService({}, store);
        instantiationService.stub(ITerminalSandboxService, {
            _serviceBrand: undefined,
            isEnabled: async () => false,
            wrapCommand: (command, _requestUnsandboxedExecution) => {
                return {
                    command,
                    isSandboxWrapped: false,
                };
            },
            getSandboxConfigPath: async () => '/tmp/sandbox.json',
            checkForSandboxingPrereqs: async () => ({ enabled: false, sandboxConfigPath: undefined, failedCheck: "config" /* TerminalSandboxPrerequisiteCheck.Config */ }),
            getTempDir: () => undefined,
            setNeedsForceUpdateConfigFile: () => { },
            ...overrides
        });
    };
    function createRewriteOptions(command) {
        return {
            commandLine: command,
            cwd: undefined,
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        };
    }
    test('returns undefined when sandbox is disabled', async () => {
        stubSandboxService();
        const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
        const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
        strictEqual(result, undefined);
    });
    test('returns undefined when sandbox config is unavailable', async () => {
        stubSandboxService({
            wrapCommand: command => ({
                command: `wrapped:${command}`,
                isSandboxWrapped: true,
            }),
            checkForSandboxingPrereqs: async () => ({ enabled: false, sandboxConfigPath: undefined, failedCheck: "config" /* TerminalSandboxPrerequisiteCheck.Config */ }),
        });
        const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
        const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
        strictEqual(result, undefined);
    });
    test('returns undefined when sandbox dependencies are unavailable', async () => {
        stubSandboxService({
            checkForSandboxingPrereqs: async () => ({
                enabled: false,
                sandboxConfigPath: '/tmp/sandbox.json',
                failedCheck: "dependencies" /* TerminalSandboxPrerequisiteCheck.Dependencies */,
                missingDependencies: ['bubblewrap'],
            }),
        });
        const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
        const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
        strictEqual(result, undefined);
    });
    test('wraps command when sandbox is enabled and config exists', async () => {
        const calls = [];
        stubSandboxService({
            wrapCommand: (command, _requestUnsandboxedExecution) => {
                calls.push('wrapCommand');
                return {
                    command: `wrapped:${command}`,
                    isSandboxWrapped: true,
                };
            },
            checkForSandboxingPrereqs: async () => {
                calls.push('checkForSandboxingPrereqs');
                return { enabled: true, sandboxConfigPath: '/tmp/sandbox.json', failedCheck: undefined };
            },
        });
        const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
        const result = await rewriter.rewrite(createRewriteOptions('echo hello'));
        strictEqual(result?.rewritten, 'wrapped:echo hello');
        strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
        deepStrictEqual(calls, ['checkForSandboxingPrereqs', 'wrapCommand']);
    });
    test('wraps command and forwards sandbox bypass flag when explicitly requested', async () => {
        const calls = [];
        stubSandboxService({
            wrapCommand: (command, requestUnsandboxedExecution) => {
                calls.push(`wrap:${command}:${String(requestUnsandboxedExecution)}`);
                return {
                    command: `wrapped:${command}`,
                    isSandboxWrapped: !requestUnsandboxedExecution,
                };
            },
            checkForSandboxingPrereqs: async () => {
                calls.push('prereqs');
                return { enabled: true, sandboxConfigPath: '/tmp/sandbox.json', failedCheck: undefined };
            },
        });
        const rewriter = store.add(instantiationService.createInstance(CommandLineSandboxRewriter));
        const result = await rewriter.rewrite({
            ...createRewriteOptions('echo hello'),
            requestUnsandboxedExecution: true,
        });
        strictEqual(result?.rewritten, 'wrapped:echo hello');
        strictEqual(result?.reasoning, 'Wrapped command for sandbox execution');
        deepStrictEqual(calls, ['prereqs', 'wrap:echo hello:true']);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVTYW5kYm94UmV3cml0ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvY29tbWFuZExpbmVTYW5kYm94UmV3cml0ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUV0RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUVuSCxPQUFPLEVBQUUsdUJBQXVCLEVBQW9DLE1BQU0sd0NBQXdDLENBQUM7QUFFbkgsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtJQUN4QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENBQUM7SUFFbkQsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLFlBQThDLEVBQUUsRUFBRSxFQUFFO1FBQy9FLG9CQUFvQixHQUFHLDZCQUE2QixDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUU7WUFDbEQsYUFBYSxFQUFFLFNBQVM7WUFDeEIsU0FBUyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsS0FBSztZQUM1QixXQUFXLEVBQUUsQ0FBQyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsRUFBRTtnQkFDdEQsT0FBTztvQkFDTixPQUFPO29CQUNQLGdCQUFnQixFQUFFLEtBQUs7aUJBQ3ZCLENBQUM7WUFDSCxDQUFDO1lBQ0Qsb0JBQW9CLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxtQkFBbUI7WUFDckQseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxTQUFTLEVBQUUsV0FBVyx3REFBeUMsRUFBRSxDQUFDO1lBQy9JLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO1lBQzNCLDZCQUE2QixFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDeEMsR0FBRyxTQUFTO1NBQ1osQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0lBRUYsU0FBUyxvQkFBb0IsQ0FBQyxPQUFlO1FBQzVDLE9BQU87WUFDTixXQUFXLEVBQUUsT0FBTztZQUNwQixHQUFHLEVBQUUsU0FBUztZQUNkLEtBQUssRUFBRSxNQUFNO1lBQ2IsRUFBRSwrQkFBdUI7U0FDekIsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLENBQUMsNENBQTRDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0Qsa0JBQWtCLEVBQUUsQ0FBQztRQUNyQixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDNUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDMUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzREFBc0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN2RSxrQkFBa0IsQ0FBQztZQUNsQixXQUFXLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QixPQUFPLEVBQUUsV0FBVyxPQUFPLEVBQUU7Z0JBQzdCLGdCQUFnQixFQUFFLElBQUk7YUFDdEIsQ0FBQztZQUNGLHlCQUF5QixFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLFdBQVcsd0RBQXlDLEVBQUUsQ0FBQztTQUMvSSxDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDNUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDMUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2REFBNkQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5RSxrQkFBa0IsQ0FBQztZQUNsQix5QkFBeUIsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ3ZDLE9BQU8sRUFBRSxLQUFLO2dCQUNkLGlCQUFpQixFQUFFLG1CQUFtQjtnQkFDdEMsV0FBVyxvRUFBK0M7Z0JBQzFELG1CQUFtQixFQUFFLENBQUMsWUFBWSxDQUFDO2FBQ25DLENBQUM7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDNUYsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDMUUsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRSxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFDM0Isa0JBQWtCLENBQUM7WUFDbEIsV0FBVyxFQUFFLENBQUMsT0FBTyxFQUFFLDRCQUE0QixFQUFFLEVBQUU7Z0JBQ3RELEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQzFCLE9BQU87b0JBQ04sT0FBTyxFQUFFLFdBQVcsT0FBTyxFQUFFO29CQUM3QixnQkFBZ0IsRUFBRSxJQUFJO2lCQUN0QixDQUFDO1lBQ0gsQ0FBQztZQUNELHlCQUF5QixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNyQyxLQUFLLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ3hDLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsQ0FBQztZQUMxRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQzFFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDckQsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUN4RSxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUMsMkJBQTJCLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwRUFBMEUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzRixNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFDM0Isa0JBQWtCLENBQUM7WUFDbEIsV0FBVyxFQUFFLENBQUMsT0FBTyxFQUFFLDJCQUEyQixFQUFFLEVBQUU7Z0JBQ3JELEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxPQUFPLElBQUksTUFBTSxDQUFDLDJCQUEyQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRSxPQUFPO29CQUNOLE9BQU8sRUFBRSxXQUFXLE9BQU8sRUFBRTtvQkFDN0IsZ0JBQWdCLEVBQUUsQ0FBQywyQkFBMkI7aUJBQzlDLENBQUM7WUFDSCxDQUFDO1lBQ0QseUJBQXlCLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3JDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3RCLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsQ0FBQztZQUMxRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUNyQyxHQUFHLG9CQUFvQixDQUFDLFlBQVksQ0FBQztZQUNyQywyQkFBMkIsRUFBRSxJQUFJO1NBQ2pDLENBQUMsQ0FBQztRQUVILFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDckQsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztRQUN4RSxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLHNCQUFzQixDQUFDLENBQUMsQ0FBQztJQUM3RCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=