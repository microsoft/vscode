/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IExternalTerminalService } from '../../../../../platform/externalTerminal/electron-browser/externalTerminalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import '../../electron-browser/externalTerminal.contribution.js';
suite('ExternalTerminal contribution', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let openTerminalCalls;
    let pickCalls;
    function createWorkspaceFolder(uri, name, index) {
        return {
            uri,
            name,
            index,
            toResource: (relativePath) => URI.joinPath(uri, relativePath)
        };
    }
    function setupServices(options) {
        instantiationService = store.add(new TestInstantiationService());
        openTerminalCalls = [];
        pickCalls = [];
        instantiationService.stub(IHistoryService, new class extends mock() {
            getLastActiveWorkspaceRoot() {
                return options.lastActiveRoot;
            }
            getLastActiveFile(_schemeFilter) {
                return options.lastActiveFile;
            }
        });
        instantiationService.stub(IExternalTerminalService, new class extends mock() {
            async openTerminal(_config, cwd) {
                openTerminalCalls.push({ cwd });
            }
        });
        instantiationService.stub(IConfigurationService, new TestConfigurationService({
            terminal: { external: { linuxExec: 'xterm', osxExec: 'Terminal.app', windowsExec: 'cmd' } }
        }));
        instantiationService.stub(IRemoteAuthorityResolverService, new class extends mock() {
        });
        instantiationService.stub(IWorkspaceContextService, new class extends mock() {
            getWorkspace() {
                return {
                    id: 'test-workspace',
                    folders: options.folders,
                };
            }
        });
        instantiationService.stub(IQuickInputService, new class extends mock() {
            async pick(picks) {
                pickCalls.push(picks);
                if (options.pickedFolder) {
                    const index = options.folders.indexOf(options.pickedFolder);
                    return picks[index];
                }
                return undefined;
            }
        });
        instantiationService.stub(ILabelService, new class extends mock() {
            getUriLabel(uri) {
                return uri.fsPath;
            }
        });
    }
    test('single folder - uses last active workspace root', async () => {
        const folderUri = URI.file('/workspace/project');
        const folder = createWorkspaceFolder(folderUri, 'project', 0);
        setupServices({
            folders: [folder],
            lastActiveRoot: folderUri,
        });
        const handler = CommandsRegistry.getCommand('workbench.action.terminal.openNativeConsole').handler;
        await instantiationService.invokeFunction(handler);
        assert.deepStrictEqual(openTerminalCalls, [{ cwd: folderUri.fsPath }]);
        assert.deepStrictEqual(pickCalls, []);
    });
    test('multiple folders - shows picker and opens selected folder', async () => {
        const folder1Uri = URI.file('/workspace/project1');
        const folder2Uri = URI.file('/workspace/project2');
        const folder1 = createWorkspaceFolder(folder1Uri, 'project1', 0);
        const folder2 = createWorkspaceFolder(folder2Uri, 'project2', 1);
        setupServices({
            folders: [folder1, folder2],
            pickedFolder: folder2,
        });
        const handler = CommandsRegistry.getCommand('workbench.action.terminal.openNativeConsole').handler;
        await instantiationService.invokeFunction(handler);
        assert.strictEqual(pickCalls.length, 1);
        assert.deepStrictEqual(openTerminalCalls, [{ cwd: folder2Uri.fsPath }]);
    });
    test('multiple folders - picker cancelled does not open terminal', async () => {
        const folder1Uri = URI.file('/workspace/project1');
        const folder2Uri = URI.file('/workspace/project2');
        const folder1 = createWorkspaceFolder(folder1Uri, 'project1', 0);
        const folder2 = createWorkspaceFolder(folder2Uri, 'project2', 1);
        setupServices({
            folders: [folder1, folder2],
            pickedFolder: undefined,
        });
        const handler = CommandsRegistry.getCommand('workbench.action.terminal.openNativeConsole').handler;
        await instantiationService.invokeFunction(handler);
        assert.strictEqual(pickCalls.length, 1);
        assert.deepStrictEqual(openTerminalCalls, []);
    });
    test('no workspace root - falls back to active file directory', async () => {
        const fileUri = URI.file('/workspace/project/src/file.ts');
        const expectedDir = URI.file('/workspace/project/src').fsPath;
        setupServices({
            folders: [],
            lastActiveRoot: undefined,
            lastActiveFile: fileUri,
        });
        const handler = CommandsRegistry.getCommand('workbench.action.terminal.openNativeConsole').handler;
        await instantiationService.invokeFunction(handler);
        assert.deepStrictEqual(openTerminalCalls, [{ cwd: expectedDir }]);
    });
    test('no workspace, no file - opens terminal without cwd', async () => {
        setupServices({
            folders: [],
            lastActiveRoot: undefined,
            lastActiveFile: undefined,
        });
        const handler = CommandsRegistry.getCommand('workbench.action.terminal.openNativeConsole').handler;
        await instantiationService.invokeFunction(handler);
        assert.deepStrictEqual(openTerminalCalls, [{ cwd: undefined }]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxUZXJtaW5hbC5jb250cmlidXRpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVybmFsVGVybWluYWwvdGVzdC9lbGVjdHJvbi1icm93c2VyL2V4dGVybmFsVGVybWluYWwuY29udHJpYnV0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNGQUFzRixDQUFDO0FBRWhJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ25ILE9BQU8sRUFBYyx3QkFBd0IsRUFBb0IsTUFBTSx1REFBdUQsQ0FBQztBQUMvSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0seURBQXlELENBQUM7QUFDN0csT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8seURBQXlELENBQUM7QUFF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