/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual } from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalSearchLinkOpener } from '../../browser/terminalLinkOpeners.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { ISearchService } from '../../../../../services/search/common/search.js';
import { SearchService } from '../../../../../services/search/common/searchService.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TerminalCommand } from '../../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { TestXtermLogger } from '../../../../../../platform/terminal/test/common/terminalTestHelpers.js';
class TestCommandDetectionCapability extends CommandDetectionCapability {
    setCommands(commands) {
        this._commands = commands;
    }
}
class TestFileService extends FileService {
    constructor() {
        super(...arguments);
        this._files = '*';
    }
    async stat(resource) {
        if (this._files === '*' || this._files.some(e => e.toString() === resource.toString())) {
            return { isFile: true, isDirectory: false, isSymbolicLink: false };
        }
        throw new Error('ENOENT');
    }
    setFiles(files) {
        this._files = files;
    }
}
class TestSearchService extends SearchService {
    async fileSearch(query) {
        return this._searchResult;
    }
    setSearchResult(result) {
        this._searchResult = result;
    }
}
class TestTerminalSearchLinkOpener extends TerminalSearchLinkOpener {
    setFileQueryBuilder(value) {
        this._fileQueryBuilder = value;
    }
}
suite('Workbench - TerminalLinkOpeners', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let fileService;
    let searchService;
    let activationResult;
    let xterm;
    setup(async () => {
        instantiationService = store.add(new TestInstantiationService());
        fileService = store.add(new TestFileService(new NullLogService()));
        searchService = store.add(new TestSearchService(null, null, null, null, null, null, null));
        instantiationService.set(IFileService, fileService);
        instantiationService.set(ILogService, new NullLogService());
        instantiationService.set(ISearchService, searchService);
        instantiationService.set(IWorkspaceContextService, new TestContextService());
        instantiationService.stub(ITerminalLogService, new NullLogService());
        instantiationService.stub(IWorkbenchEnvironmentService, {
            remoteAuthority: undefined
        });
        // Allow intercepting link activations
        activationResult = undefined;
        instantiationService.stub(IQuickInputService, {
            quickAccess: {
                show(link) {
                    activationResult = { link, source: 'search' };
                }
            }
        });
        instantiationService.stub(IEditorService, {
            async openEditor(editor) {
                activationResult = {
                    source: 'editor',
                    link: editor.resource?.toString()
                };
                // Only assert on selection if it's not the default value
                if (editor.options?.selection && (editor.options.selection.startColumn !== 1 || editor.options.selection.startLineNumber !== 1)) {
                    activationResult.selection = editor.options.selection;
                }
            }
        });
        const TerminalCtor = (await importAMDNodeModule('@xterm/xterm', 'lib/xterm.js')).Terminal;
        xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
    });
    suite('TerminalSearchLinkOpener', () => {
        let opener;
        let capabilities;
        let commandDetection;
        let localFileOpener;
        setup(() => {
            capabilities = store.add(new TerminalCapabilityStore());
            commandDetection = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
            capabilities.add(2 /* TerminalCapability.CommandDetection */, commandDetection);
        });
        test('should open single exact match against cwd when searching if it exists when command detection cwd is available', async () => {
            localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
            const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
            opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            // Set a fake detected command starting as line 0 to establish the cwd
            commandDetection.setCommands([new TerminalCommand(xterm, {
                    command: '',
                    commandLineConfidence: 'low',
                    exitCode: 0,
                    commandStartLineContent: '',
                    markProperties: {},
                    isTrusted: true,
                    cwd: '/initial/cwd',
                    timestamp: 0,
                    duration: 0,
                    executedX: undefined,
                    startX: undefined,
                    // eslint-disable-next-line local/code-no-any-casts
                    marker: {
                        line: 0
                    },
                    id: generateUuid()
                })]);
            fileService.setFiles([
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
            ]);
            await opener.open({
                text: 'foo/bar.txt',
                bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                type: "Search" /* TerminalBuiltinLinkType.Search */
            });
            deepStrictEqual(activationResult, {
                link: 'file:///initial/cwd/foo/bar.txt',
                source: 'editor'
            });
        });
        test('should open single exact match against cwd for paths containing a separator when searching if it exists, even when command detection isn\'t available', async () => {
            localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
            const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
            opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            fileService.setFiles([
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
            ]);
            await opener.open({
                text: 'foo/bar.txt',
                bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                type: "Search" /* TerminalBuiltinLinkType.Search */
            });
            deepStrictEqual(activationResult, {
                link: 'file:///initial/cwd/foo/bar.txt',
                source: 'editor'
            });
        });
        test('should open single exact match against any folder for paths not containing a separator when there is a single search result, even when command detection isn\'t available', async () => {
            localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
            const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
            opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            capabilities.remove(2 /* TerminalCapability.CommandDetection */);
            opener.setFileQueryBuilder({ file: () => null });
            fileService.setFiles([
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/baz.txt' })
            ]);
            searchService.setSearchResult({
                messages: [],
                results: [
                    { resource: URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }) }
                ]
            });
            await opener.open({
                text: 'bar.txt',
                bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                type: "Search" /* TerminalBuiltinLinkType.Search */
            });
            deepStrictEqual(activationResult, {
                link: 'file:///initial/cwd/foo/bar.txt',
                source: 'editor'
            });
        });
        test('should open single exact match against any folder for paths not containing a separator when there are multiple search results, even when command detection isn\'t available', async () => {
            localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
            const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
            opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            capabilities.remove(2 /* TerminalCapability.CommandDetection */);
            opener.setFileQueryBuilder({ file: () => null });
            fileService.setFiles([
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.test.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.test.txt' })
            ]);
            searchService.setSearchResult({
                messages: [],
                results: [
                    { resource: URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }) },
                    { resource: URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.test.txt' }) },
                    { resource: URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.test.txt' }) }
                ]
            });
            await opener.open({
                text: 'bar.txt',
                bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                type: "Search" /* TerminalBuiltinLinkType.Search */
            });
            deepStrictEqual(activationResult, {
                link: 'file:///initial/cwd/foo/bar.txt',
                source: 'editor'
            });
        });
        test('should not open single exact match for paths not containing a when command detection isn\'t available', async () => {
            localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
            const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
            opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            fileService.setFiles([
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
                URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
            ]);
            await opener.open({
                text: 'bar.txt',
                bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                type: "Search" /* TerminalBuiltinLinkType.Search */
            });
            deepStrictEqual(activationResult, {
                link: 'bar.txt',
                source: 'search'
            });
        });
        suite('macOS/Linux', () => {
            setup(() => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
            });
            test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
                const cwd = '/Users/home/folder';
                const absoluteFile = '/Users/home/folder/file.txt';
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: absoluteFile }),
                    URI.from({ scheme: Schemas.file, path: '/Users/home/folder/other/file.txt' })
                ]);
                // Set a fake detected command starting as line 0 to establish the cwd
                commandDetection.setCommands([new TerminalCommand(xterm, {
                        command: '',
                        commandLineConfidence: 'low',
                        isTrusted: true,
                        cwd,
                        timestamp: 0,
                        duration: 0,
                        executedX: undefined,
                        startX: undefined,
                        // eslint-disable-next-line local/code-no-any-casts
                        marker: {
                            line: 0
                        },
                        exitCode: 0,
                        commandStartLineContent: '',
                        markProperties: {},
                        id: generateUuid()
                    })]);
                await opener.open({
                    text: 'file.txt',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///Users/home/folder/file.txt',
                    source: 'editor'
                });
                // Clear detected commands and ensure the same request results in a search since there are 2 matches
                commandDetection.setCommands([]);
                opener.setFileQueryBuilder({ file: () => null });
                searchService.setSearchResult({
                    messages: [],
                    results: [
                        { resource: URI.from({ scheme: Schemas.file, path: 'file:///Users/home/folder/file.txt' }) },
                        { resource: URI.from({ scheme: Schemas.file, path: 'file:///Users/home/folder/other/file.txt' }) }
                    ]
                });
                await opener.open({
                    text: 'file.txt',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file.txt',
                    source: 'search'
                });
            });
            test('should extract column and/or line numbers from links in a workspace containing spaces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/space folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/space folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract column and/or line numbers from links and remove trailing periods', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                });
                await opener.open({
                    text: './foo/bar.txt:10:5.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract column and/or line numbers from links and remove grepped lines', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            // Test for https://github.com/microsoft/vscode/pull/200919#discussion_r1428124196
            test('should extract column and/or line numbers from links and remove grepped lines incl singular spaces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract line numbers from links and remove ruby stack traces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/folder/foo/bar.rb' })
                ]);
                await opener.open({
                    text: './foo/bar.rb:30:in `<main>`',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/foo/bar.rb',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 30,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should not misinterpret ISO 8601 timestamps as line:column numbers', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/folder', localFileOpener, localFolderOpener, () => 3 /* OperatingSystem.Linux */);
                // Intentionally not set the file so it does not get picked up as localFile.
                fileService.setFiles([]);
                await opener.open({
                    text: 'test-2025-04-28T11:03:09+02:00.log',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'test-2025-04-28T11:03:09+02:00.log',
                    source: 'search'
                });
                await opener.open({
                    text: './test-2025-04-28T11:03:09+02:00.log',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'test-2025-04-28T11:03:09+02:00.log',
                    source: 'search'
                });
                // Test when file exists, and there are preceding arguments
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: '/folder/test-2025-04-28T14:30:00+02:00.log' })
                ]);
                await opener.open({
                    text: './test-2025-04-28T14:30:00+02:00.log',
                    bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
                    type: "LocalFile" /* TerminalBuiltinLinkType.LocalFile */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log',
                    source: 'editor'
                });
            });
        });
        suite('Windows', () => {
            setup(() => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
            });
            test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:\\Users', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                const cwd = 'c:\\Users\\home\\folder';
                const absoluteFile = 'c:\\Users\\home\\folder\\file.txt';
                fileService.setFiles([
                    URI.file('/c:/Users/home/folder/file.txt')
                ]);
                // Set a fake detected command starting as line 0 to establish the cwd
                commandDetection.setCommands([new TerminalCommand(xterm, {
                        exitCode: 0,
                        commandStartLineContent: '',
                        markProperties: {},
                        command: '',
                        commandLineConfidence: 'low',
                        isTrusted: true,
                        cwd,
                        executedX: undefined,
                        startX: undefined,
                        timestamp: 0,
                        duration: 0,
                        // eslint-disable-next-line local/code-no-any-casts
                        marker: {
                            line: 0
                        },
                        id: generateUuid()
                    })]);
                await opener.open({
                    text: 'file.txt',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/Users/home/folder/file.txt',
                    source: 'editor'
                });
                // Clear detected commands and ensure the same request results in a search
                commandDetection.setCommands([]);
                opener.setFileQueryBuilder({ file: () => null });
                searchService.setSearchResult({
                    messages: [],
                    results: [
                        { resource: URI.file(absoluteFile) },
                        { resource: URI.file('/c:/Users/home/folder/other/file.txt') }
                    ]
                });
                await opener.open({
                    text: 'file.txt',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file.txt',
                    source: 'search'
                });
            });
            test('should extract column and/or line numbers from links in a workspace containing spaces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/space folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/space folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10:5',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/space%20folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract column and/or line numbers from links and remove trailing periods', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                });
                await opener.open({
                    text: './foo/bar.txt:10:5.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:2:5.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 2,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:2.',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 2,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract column and/or line numbers from links and remove grepped lines', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10:5:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10:import { ILoveVSCode } from \'./foo/bar.ts\';',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            // Test for https://github.com/microsoft/vscode/pull/200919#discussion_r1428124196
            test('should extract column and/or line numbers from links and remove grepped lines incl singular spaces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/folder/foo/bar.txt' })
                ]);
                await opener.open({
                    text: './foo/bar.txt:10:5: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: './foo/bar.txt:10: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10:5: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 5,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.txt:10: ',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.txt',
                    source: 'editor',
                    selection: {
                        startColumn: 1,
                        startLineNumber: 10,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should extract line numbers from links and remove ruby stack traces', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/folder/foo/bar.rb' })
                ]);
                await opener.open({
                    text: './foo/bar.rb:30:in `<main>`',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.rb',
                    source: 'editor',
                    selection: {
                        startColumn: 1, // Since Ruby doesn't appear to put columns in stack traces, this should be 1
                        startLineNumber: 30,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
                await opener.open({
                    text: '.\\foo\\bar.rb:30:in `<main>`',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/foo/bar.rb',
                    source: 'editor',
                    selection: {
                        startColumn: 1, // Since Ruby doesn't appear to put columns in stack traces, this should be 1
                        startLineNumber: 30,
                        endColumn: undefined,
                        endLineNumber: undefined
                    },
                });
            });
            test('should not misinterpret ISO 8601 timestamps as line:column numbers', async () => {
                localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
                const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
                opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/folder', localFileOpener, localFolderOpener, () => 1 /* OperatingSystem.Windows */);
                // Intentionally not set the file so it does not get picked up as localFile.
                fileService.setFiles([]);
                await opener.open({
                    text: 'test-2025-04-28T11:03:09+02:00.log',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'test-2025-04-28T11:03:09+02:00.log',
                    source: 'search'
                });
                await opener.open({
                    text: '.\\test-2025-04-28T11:03:09+02:00.log',
                    bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
                    type: "Search" /* TerminalBuiltinLinkType.Search */
                });
                deepStrictEqual(activationResult, {
                    link: 'test-2025-04-28T11:03:09+02:00.log',
                    source: 'search'
                });
                // Test when file exists, and there are preceding arguments
                fileService.setFiles([
                    URI.from({ scheme: Schemas.file, path: 'c:/folder/test-2025-04-28T14:30:00+02:00.log' })
                ]);
                await opener.open({
                    text: '.\\test-2025-04-28T14:30:00+02:00.log',
                    bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
                    type: "LocalFile" /* TerminalBuiltinLinkType.LocalFile */
                });
                deepStrictEqual(activationResult, {
                    link: 'file:///c%3A/folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log',
                    source: 'editor'
                });
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rT3BlbmVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbExpbmtPcGVuZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxZQUFZLEVBQWdDLE1BQU0sa0RBQWtELENBQUM7QUFDOUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDcEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUZBQXVGLENBQUM7QUFFbkksT0FBTyxFQUFFLDJCQUEyQixFQUFFLHdDQUF3QyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdkosT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0ZBQW9GLENBQUM7QUFDN0gsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRXpGLE9BQU8sRUFBK0IsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDOUcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2RkFBNkYsQ0FBQztBQUU5SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBUXpHLE1BQU0sOEJBQStCLFNBQVEsMEJBQTBCO0lBQ3RFLFdBQVcsQ0FBQyxRQUEyQjtRQUN0QyxJQUFJLENBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQztJQUMzQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLGVBQWdCLFNBQVEsV0FBVztJQUF6Qzs7UUFDUyxXQUFNLEdBQWdCLEdBQUcsQ0FBQztJQVVuQyxDQUFDO0lBVFMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFhO1FBQ2hDLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEtBQUssUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN4RixPQUFPLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQWtDLENBQUM7UUFDcEcsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUNELFFBQVEsQ0FBQyxLQUFrQjtRQUMxQixJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztJQUNyQixDQUFDO0NBQ0Q7QUFFRCxNQUFNLGlCQUFrQixTQUFRLGFBQWE7SUFFbkMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFpQjtRQUMxQyxPQUFPLElBQUksQ0FBQyxhQUFjLENBQUM7SUFDNUIsQ0FBQztJQUNELGVBQWUsQ0FBQyxNQUF1QjtRQUN0QyxJQUFJLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQztJQUM3QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLDRCQUE2QixTQUFRLHdCQUF3QjtJQUNsRSxtQkFBbUIsQ0FBQyxLQUFVO1FBQzdCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7SUFDaEMsQ0FBQztDQUNEO0FBRUQsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtJQUM3QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxXQUE0QixDQUFDO0lBQ2pDLElBQUksYUFBZ0MsQ0FBQztJQUNyQyxJQUFJLGdCQUEyRCxDQUFDO0lBQ2hFLElBQUksS0FBZSxDQUFDO0lBRXBCLEtBQUssQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNoQixvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLFdBQVcsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksZUFBZSxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ25FLGFBQWEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSyxFQUFFLElBQUssRUFBRSxJQUFLLEVBQUUsSUFBSyxFQUFFLElBQUssRUFBRSxJQUFLLEVBQUUsSUFBSyxDQUFDLENBQUMsQ0FBQztRQUNsRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3BELG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzVELG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDeEQsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHdCQUF3QixFQUFFLElBQUksa0JBQWtCLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDckUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFO1lBQ3ZELGVBQWUsRUFBRSxTQUFTO1NBQ2UsQ0FBQyxDQUFDO1FBQzVDLHNDQUFzQztRQUN0QyxnQkFBZ0IsR0FBRyxTQUFTLENBQUM7UUFDN0Isb0JBQW9CLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFO1lBQzdDLFdBQVcsRUFBRTtnQkFDWixJQUFJLENBQUMsSUFBWTtvQkFDaEIsZ0JBQWdCLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDO2dCQUMvQyxDQUFDO2FBQ0Q7U0FDOEIsQ0FBQyxDQUFDO1FBQ2xDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUU7WUFDekMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFnQztnQkFDaEQsZ0JBQWdCLEdBQUc7b0JBQ2xCLE1BQU0sRUFBRSxRQUFRO29CQUNoQixJQUFJLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUU7aUJBQ2pDLENBQUM7Z0JBQ0YseURBQXlEO2dCQUN6RCxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsU0FBUyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsV0FBVyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxlQUFlLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDakksZ0JBQWdCLENBQUMsU0FBUyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO2dCQUN2RCxDQUFDO1lBQ0YsQ0FBQztTQUMwQixDQUFDLENBQUM7UUFDOUIsTUFBTSxZQUFZLEdBQUcsQ0FBQyxNQUFNLG1CQUFtQixDQUFnQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDekgsS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxZQUFZLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7UUFDdEMsSUFBSSxNQUFvQyxDQUFDO1FBQ3pDLElBQUksWUFBcUMsQ0FBQztRQUMxQyxJQUFJLGdCQUFnRCxDQUFDO1FBQ3JELElBQUksZUFBNEMsQ0FBQztRQUVqRCxLQUFLLENBQUMsR0FBRyxFQUFFO1lBQ1YsWUFBWSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7WUFDeEQsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN6RyxZQUFZLENBQUMsR0FBRyw4Q0FBc0MsZ0JBQWdCLENBQUMsQ0FBQztRQUN6RSxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnSEFBZ0gsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNqSSxlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsQ0FBQyxDQUFDO1lBQzFLLHNFQUFzRTtZQUN0RSxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUU7b0JBQ3hELE9BQU8sRUFBRSxFQUFFO29CQUNYLHFCQUFxQixFQUFFLEtBQUs7b0JBQzVCLFFBQVEsRUFBRSxDQUFDO29CQUNYLHVCQUF1QixFQUFFLEVBQUU7b0JBQzNCLGNBQWMsRUFBRSxFQUFFO29CQUNsQixTQUFTLEVBQUUsSUFBSTtvQkFDZixHQUFHLEVBQUUsY0FBYztvQkFDbkIsU0FBUyxFQUFFLENBQUM7b0JBQ1osUUFBUSxFQUFFLENBQUM7b0JBQ1gsU0FBUyxFQUFFLFNBQVM7b0JBQ3BCLE1BQU0sRUFBRSxTQUFTO29CQUNqQixtREFBbUQ7b0JBQ25ELE1BQU0sRUFBRTt3QkFDUCxJQUFJLEVBQUUsQ0FBQztxQkFDb0I7b0JBQzVCLEVBQUUsRUFBRSxZQUFZLEVBQUU7aUJBQ2xCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxXQUFXLENBQUMsUUFBUSxDQUFDO2dCQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLENBQUM7Z0JBQ3BFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQzthQUNyRSxDQUFDLENBQUM7WUFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLElBQUksRUFBRSxhQUFhO2dCQUNuQixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDM0QsSUFBSSwrQ0FBZ0M7YUFDcEMsQ0FBQyxDQUFDO1lBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO2dCQUNqQyxJQUFJLEVBQUUsaUNBQWlDO2dCQUN2QyxNQUFNLEVBQUUsUUFBUTthQUNoQixDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyx1SkFBdUosRUFBRSxLQUFLLElBQUksRUFBRTtZQUN4SyxlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7WUFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsQ0FBQyxDQUFDO1lBQzFLLFdBQVcsQ0FBQyxRQUFRLENBQUM7Z0JBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQztnQkFDcEUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxDQUFDO2FBQ3JFLENBQUMsQ0FBQztZQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLGFBQWE7Z0JBQ25CLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUMzRCxJQUFJLCtDQUFnQzthQUNwQyxDQUFDLENBQUM7WUFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ2pDLElBQUksRUFBRSxpQ0FBaUM7Z0JBQ3ZDLE1BQU0sRUFBRSxRQUFRO2FBQ2hCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDJLQUEySyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzVMLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztZQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO1lBQ3hHLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixDQUFDLENBQUM7WUFDMUssWUFBWSxDQUFDLE1BQU0sNkNBQXFDLENBQUM7WUFDekQsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUssRUFBRSxDQUFDLENBQUM7WUFDbEQsV0FBVyxDQUFDLFFBQVEsQ0FBQztnQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2dCQUNwRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLENBQUM7YUFDckUsQ0FBQyxDQUFDO1lBQ0gsYUFBYSxDQUFDLGVBQWUsQ0FBQztnQkFDN0IsUUFBUSxFQUFFLEVBQUU7Z0JBQ1osT0FBTyxFQUFFO29CQUNSLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxFQUFFO2lCQUNsRjthQUNELENBQUMsQ0FBQztZQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQzNELElBQUksK0NBQWdDO2FBQ3BDLENBQUMsQ0FBQztZQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtnQkFDakMsSUFBSSxFQUFFLGlDQUFpQztnQkFDdkMsTUFBTSxFQUFFLFFBQVE7YUFDaEIsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNktBQTZLLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDOUwsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCLENBQUMsQ0FBQztZQUMxSyxZQUFZLENBQUMsTUFBTSw2Q0FBcUMsQ0FBQztZQUN6RCxNQUFNLENBQUMsbUJBQW1CLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSyxFQUFFLENBQUMsQ0FBQztZQUNsRCxXQUFXLENBQUMsUUFBUSxDQUFDO2dCQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLENBQUM7Z0JBQ3BFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsK0JBQStCLEVBQUUsQ0FBQztnQkFDekUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxnQ0FBZ0MsRUFBRSxDQUFDO2FBQzFFLENBQUMsQ0FBQztZQUNILGFBQWEsQ0FBQyxlQUFlLENBQUM7Z0JBQzdCLFFBQVEsRUFBRSxFQUFFO2dCQUNaLE9BQU8sRUFBRTtvQkFDUixFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLENBQUMsRUFBRTtvQkFDbEYsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSwrQkFBK0IsRUFBRSxDQUFDLEVBQUU7b0JBQ3ZGLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxFQUFFO2lCQUN4RjthQUNELENBQUMsQ0FBQztZQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDakIsSUFBSSxFQUFFLFNBQVM7Z0JBQ2YsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQzNELElBQUksK0NBQWdDO2FBQ3BDLENBQUMsQ0FBQztZQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtnQkFDakMsSUFBSSxFQUFFLGlDQUFpQztnQkFDdkMsTUFBTSxFQUFFLFFBQVE7YUFDaEIsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsdUdBQXVHLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDeEgsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCLENBQUMsQ0FBQztZQUMxSyxXQUFXLENBQUMsUUFBUSxDQUFDO2dCQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDBCQUEwQixFQUFFLENBQUM7Z0JBQ3BFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsQ0FBQzthQUNyRSxDQUFDLENBQUM7WUFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2pCLElBQUksRUFBRSxTQUFTO2dCQUNmLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUMzRCxJQUFJLCtDQUFnQzthQUNwQyxDQUFDLENBQUM7WUFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ2pDLElBQUksRUFBRSxTQUFTO2dCQUNmLE1BQU0sRUFBRSxRQUFRO2FBQ2hCLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7WUFDekIsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDVixlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7Z0JBQ3hHLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixDQUFDLENBQUM7WUFDL0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsd0ZBQXdGLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3pHLE1BQU0sR0FBRyxHQUFHLG9CQUFvQixDQUFDO2dCQUNqQyxNQUFNLFlBQVksR0FBRyw2QkFBNkIsQ0FBQztnQkFDbkQsV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsQ0FBQztvQkFDdEQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxtQ0FBbUMsRUFBRSxDQUFDO2lCQUM3RSxDQUFDLENBQUM7Z0JBRUgsc0VBQXNFO2dCQUN0RSxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUU7d0JBQ3hELE9BQU8sRUFBRSxFQUFFO3dCQUNYLHFCQUFxQixFQUFFLEtBQUs7d0JBQzVCLFNBQVMsRUFBRSxJQUFJO3dCQUNmLEdBQUc7d0JBQ0gsU0FBUyxFQUFFLENBQUM7d0JBQ1osUUFBUSxFQUFFLENBQUM7d0JBQ1gsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLE1BQU0sRUFBRSxTQUFTO3dCQUNqQixtREFBbUQ7d0JBQ25ELE1BQU0sRUFBRTs0QkFDUCxJQUFJLEVBQUUsQ0FBQzt5QkFDb0I7d0JBQzVCLFFBQVEsRUFBRSxDQUFDO3dCQUNYLHVCQUF1QixFQUFFLEVBQUU7d0JBQzNCLGNBQWMsRUFBRSxFQUFFO3dCQUNsQixFQUFFLEVBQUUsWUFBWSxFQUFFO3FCQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLG9DQUFvQztvQkFDMUMsTUFBTSxFQUFFLFFBQVE7aUJBQ2hCLENBQUMsQ0FBQztnQkFFSCxvR0FBb0c7Z0JBQ3BHLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ2xELGFBQWEsQ0FBQyxlQUFlLENBQUM7b0JBQzdCLFFBQVEsRUFBRSxFQUFFO29CQUNaLE9BQU8sRUFBRTt3QkFDUixFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLG9DQUFvQyxFQUFFLENBQUMsRUFBRTt3QkFDNUYsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSwwQ0FBMEMsRUFBRSxDQUFDLEVBQUU7cUJBQ2xHO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxVQUFVO29CQUNoQixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxVQUFVO29CQUNoQixNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsdUZBQXVGLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3hHLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCLENBQUMsQ0FBQztnQkFDM0ssV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxDQUFDO2lCQUNyRSxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsb0JBQW9CO29CQUMxQixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxvQ0FBb0M7b0JBQzFDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLGtCQUFrQjtvQkFDeEIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsb0NBQW9DO29CQUMxQyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGtGQUFrRixFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNuRyxlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7Z0JBQ3hHLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixDQUFDLENBQUM7Z0JBQ3JLLFdBQVcsQ0FBQyxRQUFRLENBQUM7b0JBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztpQkFDL0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLGdCQUFnQjtvQkFDdEIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsNEJBQTRCO29CQUNsQyxNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHFCQUFxQjtvQkFDM0IsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsNEJBQTRCO29CQUNsQyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxtQkFBbUI7b0JBQ3pCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLDRCQUE0QjtvQkFDbEMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQywrRUFBK0UsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDaEcsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsQ0FBQyxDQUFDO2dCQUNySyxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLENBQUM7aUJBQy9ELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxrRUFBa0U7b0JBQ3hFLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLDRCQUE0QjtvQkFDbEMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsZ0VBQWdFO29CQUN0RSxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSw0QkFBNEI7b0JBQ2xDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxrRkFBa0Y7WUFDbEYsSUFBSSxDQUFDLG9HQUFvRyxFQUFFLEtBQUssSUFBSSxFQUFFO2dCQUNySCxlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7Z0JBQ3hHLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLDhCQUFzQixDQUFDLENBQUM7Z0JBQ3JLLFdBQVcsQ0FBQyxRQUFRLENBQUM7b0JBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUscUJBQXFCLEVBQUUsQ0FBQztpQkFDL0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHNCQUFzQjtvQkFDNUIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsNEJBQTRCO29CQUNsQyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxvQkFBb0I7b0JBQzFCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLDRCQUE0QjtvQkFDbEMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxxRUFBcUUsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDdEYsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsQ0FBQyxDQUFDO2dCQUNySyxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLENBQUM7aUJBQzlELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSw2QkFBNkI7b0JBQ25DLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLDJCQUEyQjtvQkFDakMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxvRUFBb0UsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDckYsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSw4QkFBc0IsQ0FBQyxDQUFDO2dCQUNySyw0RUFBNEU7Z0JBQzVFLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3pCLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLG9DQUFvQztvQkFDMUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzVELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsb0NBQW9DO29CQUMxQyxNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHNDQUFzQztvQkFDNUMsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzVELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsb0NBQW9DO29CQUMxQyxNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO2dCQUVILDJEQUEyRDtnQkFDM0QsV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSw0Q0FBNEMsRUFBRSxDQUFDO2lCQUN0RixDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsc0NBQXNDO29CQUM1QyxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDN0QsSUFBSSxxREFBbUM7aUJBQ3ZDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSwyREFBMkQ7b0JBQ2pFLE1BQU0sRUFBRSxRQUFRO2lCQUNoQixDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUdKLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7WUFDckIsS0FBSyxDQUFDLEdBQUcsRUFBRTtnQkFDVixlQUFlLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7Z0JBQ25GLE1BQU0saUJBQWlCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7Z0JBQ3hHLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLGdDQUF3QixDQUFDLENBQUM7WUFDakssQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsd0ZBQXdGLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3pHLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsZ0NBQXdCLENBQUMsQ0FBQztnQkFFekssTUFBTSxHQUFHLEdBQUcseUJBQXlCLENBQUM7Z0JBQ3RDLE1BQU0sWUFBWSxHQUFHLG1DQUFtQyxDQUFDO2dCQUV6RCxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDO2lCQUMxQyxDQUFDLENBQUM7Z0JBRUgsc0VBQXNFO2dCQUN0RSxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUU7d0JBQ3hELFFBQVEsRUFBRSxDQUFDO3dCQUNYLHVCQUF1QixFQUFFLEVBQUU7d0JBQzNCLGNBQWMsRUFBRSxFQUFFO3dCQUNsQixPQUFPLEVBQUUsRUFBRTt3QkFDWCxxQkFBcUIsRUFBRSxLQUFLO3dCQUM1QixTQUFTLEVBQUUsSUFBSTt3QkFDZixHQUFHO3dCQUNILFNBQVMsRUFBRSxTQUFTO3dCQUNwQixNQUFNLEVBQUUsU0FBUzt3QkFDakIsU0FBUyxFQUFFLENBQUM7d0JBQ1osUUFBUSxFQUFFLENBQUM7d0JBQ1gsbURBQW1EO3dCQUNuRCxNQUFNLEVBQUU7NEJBQ1AsSUFBSSxFQUFFLENBQUM7eUJBQ29CO3dCQUM1QixFQUFFLEVBQUUsWUFBWSxFQUFFO3FCQUNsQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNMLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLFVBQVU7b0JBQ2hCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLHlDQUF5QztvQkFDL0MsTUFBTSxFQUFFLFFBQVE7aUJBQ2hCLENBQUMsQ0FBQztnQkFFSCwwRUFBMEU7Z0JBQzFFLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ2xELGFBQWEsQ0FBQyxlQUFlLENBQUM7b0JBQzdCLFFBQVEsRUFBRSxFQUFFO29CQUNaLE9BQU8sRUFBRTt3QkFDUixFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxFQUFFO3dCQUNwQyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLHNDQUFzQyxDQUFDLEVBQUU7cUJBQzlEO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxVQUFVO29CQUNoQixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxVQUFVO29CQUNoQixNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsdUZBQXVGLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3hHLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxnQ0FBd0IsQ0FBQyxDQUFDO2dCQUMvSyxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLDZCQUE2QixFQUFFLENBQUM7aUJBQ3ZFLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxvQkFBb0I7b0JBQzFCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLHlDQUF5QztvQkFDL0MsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsa0JBQWtCO29CQUN4QixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSx5Q0FBeUM7b0JBQy9DLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHNCQUFzQjtvQkFDNUIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUseUNBQXlDO29CQUMvQyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxvQkFBb0I7b0JBQzFCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLHlDQUF5QztvQkFDL0MsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxrRkFBa0YsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDbkcsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxnQ0FBd0IsQ0FBQyxDQUFDO2dCQUN6SyxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLENBQUM7aUJBQ2pFLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxnQkFBZ0I7b0JBQ3RCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7aUJBQ2hCLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxxQkFBcUI7b0JBQzNCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsbUJBQW1CO29CQUN6QixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxpQ0FBaUM7b0JBQ3ZDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLGtCQUFrQjtvQkFDeEIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsaUNBQWlDO29CQUN2QyxNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHNCQUFzQjtvQkFDNUIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsaUNBQWlDO29CQUN2QyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxDQUFDO3dCQUNsQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxvQkFBb0I7b0JBQzFCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsQ0FBQzt3QkFDbEIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQywrRUFBK0UsRUFBRSxLQUFLLElBQUksRUFBRTtnQkFDaEcsZUFBZSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO2dCQUNuRixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyx3Q0FBd0MsQ0FBQyxDQUFDO2dCQUN4RyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxnQ0FBd0IsQ0FBQyxDQUFDO2dCQUN6SyxXQUFXLENBQUMsUUFBUSxDQUFDO29CQUNwQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLENBQUM7aUJBQ2pFLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxrRUFBa0U7b0JBQ3hFLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsZ0VBQWdFO29CQUN0RSxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxpQ0FBaUM7b0JBQ3ZDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLG9FQUFvRTtvQkFDMUUsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsaUNBQWlDO29CQUN2QyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxrRUFBa0U7b0JBQ3hFLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztZQUVILGtGQUFrRjtZQUNsRixJQUFJLENBQUMsb0dBQW9HLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3JILGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsZ0NBQXdCLENBQUMsQ0FBQztnQkFDekssV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxDQUFDO2lCQUNqRSxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsc0JBQXNCO29CQUM1QixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxpQ0FBaUM7b0JBQ3ZDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLG9CQUFvQjtvQkFDMUIsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzNELElBQUksK0NBQWdDO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsaUNBQWlDO29CQUN2QyxNQUFNLEVBQUUsUUFBUTtvQkFDaEIsU0FBUyxFQUFFO3dCQUNWLFdBQVcsRUFBRSxDQUFDO3dCQUNkLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSx3QkFBd0I7b0JBQzlCLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGlDQUFpQztvQkFDdkMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQzt3QkFDZCxlQUFlLEVBQUUsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLFNBQVM7d0JBQ3BCLGFBQWEsRUFBRSxTQUFTO3FCQUN4QjtpQkFDRCxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsc0JBQXNCO29CQUM1QixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxpQ0FBaUM7b0JBQ3ZDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMscUVBQXFFLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3RGLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsZ0NBQXdCLENBQUMsQ0FBQztnQkFDekssV0FBVyxDQUFDLFFBQVEsQ0FBQztvQkFDcEIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxzQkFBc0IsRUFBRSxDQUFDO2lCQUNoRSxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNqQixJQUFJLEVBQUUsNkJBQTZCO29CQUNuQyxXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtvQkFDM0QsSUFBSSwrQ0FBZ0M7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxlQUFlLENBQUMsZ0JBQWdCLEVBQUU7b0JBQ2pDLElBQUksRUFBRSxnQ0FBZ0M7b0JBQ3RDLE1BQU0sRUFBRSxRQUFRO29CQUNoQixTQUFTLEVBQUU7d0JBQ1YsV0FBVyxFQUFFLENBQUMsRUFBRSw2RUFBNkU7d0JBQzdGLGVBQWUsRUFBRSxFQUFFO3dCQUNuQixTQUFTLEVBQUUsU0FBUzt3QkFDcEIsYUFBYSxFQUFFLFNBQVM7cUJBQ3hCO2lCQUNELENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSwrQkFBK0I7b0JBQ3JDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUMzRCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLGdDQUFnQztvQkFDdEMsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLFNBQVMsRUFBRTt3QkFDVixXQUFXLEVBQUUsQ0FBQyxFQUFFLDZFQUE2RTt3QkFDN0YsZUFBZSxFQUFFLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxTQUFTO3dCQUNwQixhQUFhLEVBQUUsU0FBUztxQkFDeEI7aUJBQ0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7WUFFSCxJQUFJLENBQUMsb0VBQW9FLEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ3JGLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztnQkFDbkYsTUFBTSxpQkFBaUIsR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsd0NBQXdDLENBQUMsQ0FBQztnQkFDeEcsTUFBTSxHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsZ0NBQXdCLENBQUMsQ0FBQztnQkFDekssNEVBQTRFO2dCQUM1RSxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6QixNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSxvQ0FBb0M7b0JBQzFDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUM1RCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLG9DQUFvQztvQkFDMUMsTUFBTSxFQUFFLFFBQVE7aUJBQ2hCLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ2pCLElBQUksRUFBRSx1Q0FBdUM7b0JBQzdDLFdBQVcsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO29CQUM1RCxJQUFJLCtDQUFnQztpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILGVBQWUsQ0FBQyxnQkFBZ0IsRUFBRTtvQkFDakMsSUFBSSxFQUFFLG9DQUFvQztvQkFDMUMsTUFBTSxFQUFFLFFBQVE7aUJBQ2hCLENBQUMsQ0FBQztnQkFFSCwyREFBMkQ7Z0JBQzNELFdBQVcsQ0FBQyxRQUFRLENBQUM7b0JBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsOENBQThDLEVBQUUsQ0FBQztpQkFDeEYsQ0FBQyxDQUFDO2dCQUNILE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQztvQkFDakIsSUFBSSxFQUFFLHVDQUF1QztvQkFDN0MsV0FBVyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7b0JBQzdELElBQUkscURBQW1DO2lCQUN2QyxDQUFDLENBQUM7Z0JBQ0gsZUFBZSxDQUFDLGdCQUFnQixFQUFFO29CQUNqQyxJQUFJLEVBQUUsZ0VBQWdFO29CQUN0RSxNQUFNLEVBQUUsUUFBUTtpQkFDaEIsQ0FBQyxDQUFDO1lBQ0osQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==