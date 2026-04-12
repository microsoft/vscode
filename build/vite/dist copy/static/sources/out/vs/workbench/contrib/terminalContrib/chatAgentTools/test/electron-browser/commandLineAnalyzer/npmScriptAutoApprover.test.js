/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { NpmScriptAutoApprover } from '../../../browser/tools/commandLineAnalyzer/autoApprove/npmScriptAutoApprover.js';
suite('NpmScriptAutoApprover', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let approver;
    let configurationService;
    let workspaceContextService;
    let fileService;
    let fileSystemProvider;
    // Use inMemory scheme to avoid platform-specific path issues
    const cwd = URI.from({ scheme: Schemas.inMemory, path: '/workspace/project' });
    setup(async () => {
        fileService = store.add(new FileService(new NullLogService()));
        // Register file: scheme provider for tree-sitter WASM grammar loading
        store.add(fileService.registerProvider(Schemas.file, new TestIPCFileSystemProvider()));
        // Register inMemory: scheme provider for test package.json files
        fileSystemProvider = store.add(new InMemoryFileSystemProvider());
        store.add(fileService.registerProvider(Schemas.inMemory, fileSystemProvider));
        // Create workspace directory structure
        await fileService.createFolder(cwd);
        configurationService = new TestConfigurationService();
        workspaceContextService = new TestContextService();
        instantiationService = workbenchInstantiationService({
            fileService: () => fileService,
            configurationService: () => configurationService
        }, store);
        instantiationService.stub(IWorkspaceContextService, workspaceContextService);
        instantiationService.stub(IFileService, fileService);
        approver = store.add(instantiationService.createInstance(NpmScriptAutoApprover));
        // Enable npm script auto-approve by default for tests
        configurationService.setUserConfiguration("chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts */, true);
        // Setup workspace
        const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
        workspaceContextService.setWorkspace(workspace);
    });
    async function writePackageJson(uri, scripts) {
        const packageJson = {
            name: 'test-project',
            version: '1.0.0',
            scripts
        };
        await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(packageJson, null, 2)));
    }
    async function t(command, scripts, expectedAutoApproved) {
        const packageJsonUri = URI.joinPath(cwd, 'package.json');
        await writePackageJson(packageJsonUri, scripts);
        const result = await approver.isCommandAutoApproved(command, cwd);
        strictEqual(result.isAutoApproved, expectedAutoApproved, `Expected isAutoApproved to be ${expectedAutoApproved} for: ${command}`);
    }
    suite('npm run commands', () => {
        test('npm run build - script exists', () => t('npm run build', { build: 'tsc' }, true));
        test('npm run test - script exists', () => t('npm run test', { test: 'jest' }, true));
        test('npm run dev - script exists', () => t('npm run dev', { dev: 'vite' }, true));
        test('npm run start - script exists', () => t('npm run start', { start: 'node index.js' }, true));
        test('npm run lint - script exists', () => t('npm run lint', { lint: 'eslint .' }, true));
        test('npm run-script build - script exists', () => t('npm run-script build', { build: 'tsc' }, true));
        // npm shorthand commands (npm test, npm start, npm stop, npm restart)
        test('npm test - shorthand script exists', () => t('npm test', { test: 'jest' }, true));
        test('npm start - shorthand script exists', () => t('npm start', { start: 'node index.js' }, true));
        test('npm stop - shorthand script exists', () => t('npm stop', { stop: 'pkill node' }, true));
        test('npm restart - shorthand script exists', () => t('npm restart', { restart: 'npm stop && npm start' }, true));
        test('npm test - shorthand script does not exist', () => t('npm test', { build: 'tsc' }, false));
        test('npm test -- --watch - shorthand with args', () => t('npm test -- --watch', { test: 'jest' }, true));
        test('npm startevil - word boundary prevents match', () => t('npm startevil', { start: 'node index.js', startevil: 'evil' }, false));
        test('npm install - built-in command, not a script', () => t('npm install', { install: 'echo should not match' }, false));
        // Scripts with colons (namespaced scripts)
        test('npm run build:prod - script with colon exists', () => t('npm run build:prod', { 'build:prod': 'tsc --build' }, true));
        test('npm run test:unit - script with colon exists', () => t('npm run test:unit', { 'test:unit': 'jest --testPathPattern=unit' }, true));
        test('npm run lint:fix - script with colon exists', () => t('npm run lint:fix', { 'lint:fix': 'eslint . --fix' }, true));
        test('npm run missing - script does not exist', () => t('npm run missing', { build: 'tsc' }, false));
        test('npm run build - no scripts section', async () => {
            const packageJsonUri = URI.joinPath(cwd, 'package.json');
            await fileService.writeFile(packageJsonUri, VSBuffer.fromString(JSON.stringify({ name: 'test' })));
            const result = await approver.isCommandAutoApproved('npm run build', cwd);
            strictEqual(result.isAutoApproved, false);
        });
    });
    suite('yarn commands', () => {
        test('yarn run build - script exists', () => t('yarn run build', { build: 'tsc' }, true));
        test('yarn run test - script exists', () => t('yarn run test', { test: 'jest' }, true));
        // Yarn shorthand (yarn <script>)
        test('yarn build - script exists (shorthand)', () => t('yarn build', { build: 'tsc' }, true));
        test('yarn test - script exists (shorthand)', () => t('yarn test', { test: 'jest' }, true));
        // Yarn built-in commands should not match
        test('yarn install - built-in command, not a script', () => t('yarn install', { install: 'echo should not match' }, false));
        test('yarn add - built-in command, not a script', () => t('yarn add lodash', { add: 'echo should not match' }, false));
        test('yarn run missing - script does not exist', () => t('yarn run missing', { build: 'tsc' }, false));
    });
    suite('pnpm commands', () => {
        test('pnpm run build - script exists', () => t('pnpm run build', { build: 'tsc' }, true));
        test('pnpm run test - script exists', () => t('pnpm run test', { test: 'jest' }, true));
        // pnpm shorthand (pnpm <script>)
        test('pnpm build - script exists (shorthand)', () => t('pnpm build', { build: 'tsc' }, true));
        test('pnpm test - script exists (shorthand)', () => t('pnpm test', { test: 'jest' }, true));
        // pnpm built-in commands should not match
        test('pnpm install - built-in command, not a script', () => t('pnpm install', { install: 'echo should not match' }, false));
        test('pnpm add - built-in command, not a script', () => t('pnpm add lodash', { add: 'echo should not match' }, false));
        test('pnpm run missing - script does not exist', () => t('pnpm run missing', { build: 'tsc' }, false));
    });
    suite('no package.json', () => {
        test('npm run build - no package.json file', async () => {
            const result = await approver.isCommandAutoApproved('npm run build', URI.from({ scheme: Schemas.inMemory, path: '/nonexistent/path' }));
            strictEqual(result.isAutoApproved, false);
        });
    });
    suite('non-npm commands', () => {
        test('git status - not an npm command', () => t('git status', { build: 'tsc' }, false));
        test('ls -la - not an npm command', () => t('ls -la', { build: 'tsc' }, false));
        test('echo hello - not an npm command', () => t('echo hello', { build: 'tsc' }, false));
    });
    suite('auto-approve disabled', () => {
        test('npm run build - npm script auto-approve setting disabled', async () => {
            configurationService.setUserConfiguration("chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts */, false);
            const packageJsonUri = URI.joinPath(cwd, 'package.json');
            await writePackageJson(packageJsonUri, { build: 'tsc' });
            const result = await approver.isCommandAutoApproved('npm run build', cwd);
            strictEqual(result.isAutoApproved, false);
        });
    });
    suite('autoApproveInfo message', () => {
        test('single script - message contains script name', async () => {
            const packageJsonUri = URI.joinPath(cwd, 'package.json');
            await writePackageJson(packageJsonUri, { build: 'tsc' });
            const result = await approver.isCommandAutoApproved('npm run build', cwd);
            strictEqual(result.isAutoApproved, true);
            strictEqual(result.scriptName, 'build', 'Should return script name');
            strictEqual(result.autoApproveInfo?.value.includes('build'), true, 'Should mention script name');
            strictEqual(result.autoApproveInfo?.value.includes('package.json'), true, 'Should mention package.json');
        });
    });
    suite('workspace folder security', () => {
        test('cwd outside workspace - does not auto-approve', async () => {
            // Create package.json outside workspace
            const outsideCwd = URI.from({ scheme: Schemas.inMemory, path: '/outside/project' });
            await fileService.createFolder(outsideCwd);
            const outsidePackageJsonUri = URI.joinPath(outsideCwd, 'package.json');
            await writePackageJson(outsidePackageJsonUri, { build: 'tsc' });
            const result = await approver.isCommandAutoApproved('npm run build', outsideCwd);
            strictEqual(result.isAutoApproved, false, 'Should not auto-approve when cwd is outside workspace');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnBtU2NyaXB0QXV0b0FwcHJvdmVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9lbGVjdHJvbi1icm93c2VyL2NvbW1hbmRMaW5lQW5hbHl6ZXIvbnBtU2NyaXB0QXV0b0FwcHJvdmVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDeEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBRXRILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUMxSCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDakcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDN0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFNUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0saUZBQWlGLENBQUM7QUFFeEgsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUNuQyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxRQUErQixDQUFDO0lBQ3BDLElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSx1QkFBMkMsQ0FBQztJQUNoRCxJQUFJLFdBQXdCLENBQUM7SUFDN0IsSUFBSSxrQkFBOEMsQ0FBQztJQUVuRCw2REFBNkQ7SUFDN0QsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7SUFFL0UsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ2hCLFdBQVcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksV0FBVyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRS9ELHNFQUFzRTtRQUN0RSxLQUFLLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkYsaUVBQWlFO1FBQ2pFLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7UUFDakUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFOUUsdUNBQXVDO1FBQ3ZDLE1BQU0sV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVwQyxvQkFBb0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7UUFDdEQsdUJBQXVCLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBRW5ELG9CQUFvQixHQUFHLDZCQUE2QixDQUFDO1lBQ3BELFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxXQUFXO1lBQzlCLG9CQUFvQixFQUFFLEdBQUcsRUFBRSxDQUFDLG9CQUFvQjtTQUNoRCxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRVYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDN0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxXQUFXLENBQUMsQ0FBQztRQUVyRCxRQUFRLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBRWpGLHNEQUFzRDtRQUN0RCxvQkFBb0IsQ0FBQyxvQkFBb0IsNEhBQWlFLElBQUksQ0FBQyxDQUFDO1FBRWhILGtCQUFrQjtRQUNsQixNQUFNLFNBQVMsR0FBRyxJQUFJLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEUsdUJBQXVCLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2pELENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxVQUFVLGdCQUFnQixDQUFDLEdBQVEsRUFBRSxPQUErQjtRQUN4RSxNQUFNLFdBQVcsR0FBRztZQUNuQixJQUFJLEVBQUUsY0FBYztZQUNwQixPQUFPLEVBQUUsT0FBTztZQUNoQixPQUFPO1NBQ1AsQ0FBQztRQUNGLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdGLENBQUM7SUFFRCxLQUFLLFVBQVUsQ0FBQyxDQUFDLE9BQWUsRUFBRSxPQUErQixFQUFFLG9CQUE2QjtRQUMvRixNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN6RCxNQUFNLGdCQUFnQixDQUFDLGNBQWMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsaUNBQWlDLG9CQUFvQixTQUFTLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDbkksQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsYUFBYSxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbkYsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsRyxJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzFGLElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV0RyxzRUFBc0U7UUFDdEUsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2xILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDakcsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzFHLElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUNySSxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFMUgsMkNBQTJDO1FBQzNDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM1SCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsV0FBVyxFQUFFLDZCQUE2QixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN6SSxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsVUFBVSxFQUFFLGdCQUFnQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV6SCxJQUFJLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDckcsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3JELE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRW5HLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMxRSxXQUFXLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDM0IsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzFGLElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFeEYsaUNBQWlDO1FBQ2pDLElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUU1RiwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxHQUFHLEVBQUUsdUJBQXVCLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXZILElBQUksQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN4RyxDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1FBQzNCLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRXhGLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFNUYsMENBQTBDO1FBQzFDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsY0FBYyxFQUFFLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM1SCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsR0FBRyxFQUFFLHVCQUF1QixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUV2SCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDeEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxLQUFLLElBQUksRUFBRTtZQUN2RCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4SSxXQUFXLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM5QixJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDaEYsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN6RixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbkMsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzNFLG9CQUFvQixDQUFDLG9CQUFvQiw0SEFBaUUsS0FBSyxDQUFDLENBQUM7WUFFakgsTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsY0FBYyxDQUFDLENBQUM7WUFDekQsTUFBTSxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUV6RCxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDMUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0MsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDckMsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQy9ELE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sZ0JBQWdCLENBQUMsY0FBYyxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFekQsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMscUJBQXFCLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3pDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLE9BQU8sRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1lBQ3JFLFdBQVcsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsSUFBSSxFQUFFLDRCQUE0QixDQUFDLENBQUM7WUFDakcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxJQUFJLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztRQUMxRyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtRQUN2QyxJQUFJLENBQUMsK0NBQStDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDaEUsd0NBQXdDO1lBQ3hDLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sV0FBVyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMzQyxNQUFNLHFCQUFxQixHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3ZFLE1BQU0sZ0JBQWdCLENBQUMscUJBQXFCLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUVoRSxNQUFNLE1BQU0sR0FBRyxNQUFNLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDakYsV0FBVyxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsS0FBSyxFQUFFLHVEQUF1RCxDQUFDLENBQUM7UUFDcEcsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=