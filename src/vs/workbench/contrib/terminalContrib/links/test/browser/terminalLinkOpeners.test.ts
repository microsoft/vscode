/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Schemas } from 'vs/base/common/network';
import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ITextEditorSelection, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IFileService, IFileStatWithPartialMetadata } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalSearchLinkOpener } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkOpeners';
import { TerminalCapability, ITerminalCommand, IXtermMarker } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import type { Terminal } from 'xterm';
import { IFileQuery, ISearchComplete, ISearchService } from 'vs/workbench/services/search/common/search';
import { SearchService } from 'vs/workbench/services/search/common/searchService';
import { ITerminalLogService, ITerminalOutputMatcher } from 'vs/platform/terminal/common/terminal';
import { importAMDNodeModule } from 'vs/amdX';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

interface ITerminalLinkActivationResult {
	source: 'editor' | 'search';
	link: string;
	selection?: ITextEditorSelection;
}

class TestCommandDetectionCapability extends CommandDetectionCapability {
	setCommands(commands: ITerminalCommand[]) {
		this._commands = commands;
	}
}

class TestFileService extends FileService {
	private _files: URI[] | '*' = '*';
	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		if (this._files === '*' || this._files.some(e => e.toString() === resource.toString())) {
			return { isFile: true, isDirectory: false, isSymbolicLink: false } as IFileStatWithPartialMetadata;
		}
		throw new Error('ENOENT');
	}
	setFiles(files: URI[] | '*'): void {
		this._files = files;
	}
}

class TestSearchService extends SearchService {
	private _searchResult: ISearchComplete | undefined;
	override async fileSearch(query: IFileQuery): Promise<ISearchComplete> {
		return this._searchResult!;
	}
	setSearchResult(result: ISearchComplete) {
		this._searchResult = result;
	}
}

class TestTerminalSearchLinkOpener extends TerminalSearchLinkOpener {
	setFileQueryBuilder(value: any) {
		this._fileQueryBuilder = value;
	}
}

suite('Workbench - TerminalLinkOpeners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let fileService: TestFileService;
	let searchService: TestSearchService;
	let activationResult: ITerminalLinkActivationResult | undefined;
	let xterm: Terminal;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());
		fileService = store.add(new TestFileService(new NullLogService()));
		searchService = store.add(new TestSearchService(null!, null!, null!, null!, null!, null!, null!));
		instantiationService.set(IFileService, fileService);
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.set(ISearchService, searchService);
		instantiationService.set(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(ITerminalLogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, {
			remoteAuthority: undefined
		} as Partial<IWorkbenchEnvironmentService>);
		// Allow intercepting link activations
		activationResult = undefined;
		instantiationService.stub(IQuickInputService, {
			quickAccess: {
				show(link: string) {
					activationResult = { link, source: 'search' };
				}
			}
		} as Partial<IQuickInputService>);
		instantiationService.stub(IEditorService, {
			async openEditor(editor: ITextResourceEditorInput): Promise<any> {
				activationResult = {
					source: 'editor',
					link: editor.resource?.toString()
				};
				// Only assert on selection if it's not the default value
				if (editor.options?.selection && (editor.options.selection.startColumn !== 1 || editor.options.selection.startLineNumber !== 1)) {
					activationResult.selection = editor.options.selection;
				}
			}
		} as Partial<IEditorService>);
		const TerminalCtor = (await importAMDNodeModule<typeof import('xterm')>('xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor({ allowProposedApi: true }));
	});

	suite('TerminalSearchLinkOpener', () => {
		let opener: TestTerminalSearchLinkOpener;
		let capabilities: TerminalCapabilityStore;
		let commandDetection: TestCommandDetectionCapability;
		let localFileOpener: TerminalLocalFileLinkOpener;

		setup(() => {
			capabilities = store.add(new TerminalCapabilityStore());
			commandDetection = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
			capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		});

		test('should open single exact match against cwd when searching if it exists when command detection cwd is available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			// Set a fake detected command starting as line 0 to establish the cwd
			commandDetection.setCommands([{
				command: '',
				exitCode: 0,
				commandStartLineContent: '',
				markProperties: {},
				isTrusted: true,
				cwd: '/initial/cwd',
				timestamp: 0,
				getOutput() { return undefined; },
				getOutputMatch(outputMatcher: ITerminalOutputMatcher) { return undefined; },
				marker: {
					line: 0
				} as Partial<IXtermMarker> as any,
				hasOutput() { return true; }
			}]);
			fileService.setFiles([
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
			]);
			await opener.open({
				text: 'foo/bar.txt',
				bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
				type: TerminalBuiltinLinkType.Search
			});
			deepStrictEqual(activationResult, {
				link: 'file:///initial/cwd/foo/bar.txt',
				source: 'editor'
			});
		});

		test('should open single exact match against cwd for paths containing a separator when searching if it exists, even when command detection isn\'t available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			fileService.setFiles([
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
			]);
			await opener.open({
				text: 'foo/bar.txt',
				bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
				type: TerminalBuiltinLinkType.Search
			});
			deepStrictEqual(activationResult, {
				link: 'file:///initial/cwd/foo/bar.txt',
				source: 'editor'
			});
		});

		test('should open single exact match against any folder for paths not containing a separator when there is a single search result, even when command detection isn\'t available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			capabilities.remove(TerminalCapability.CommandDetection);
			opener.setFileQueryBuilder({ file: () => null! });
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
				type: TerminalBuiltinLinkType.Search
			});
			deepStrictEqual(activationResult, {
				link: 'file:///initial/cwd/foo/bar.txt',
				source: 'editor'
			});
		});

		test('should open single exact match against any folder for paths not containing a separator when there are multiple search results, even when command detection isn\'t available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			capabilities.remove(TerminalCapability.CommandDetection);
			opener.setFileQueryBuilder({ file: () => null! });
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
				type: TerminalBuiltinLinkType.Search
			});
			deepStrictEqual(activationResult, {
				link: 'file:///initial/cwd/foo/bar.txt',
				source: 'editor'
			});
		});

		test('should not open single exact match for paths not containing a when command detection isn\'t available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/initial/cwd', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			fileService.setFiles([
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo/bar.txt' }),
				URI.from({ scheme: Schemas.file, path: '/initial/cwd/foo2/bar.txt' })
			]);
			await opener.open({
				text: 'bar.txt',
				bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
				type: TerminalBuiltinLinkType.Search
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
				opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
			});

			test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
				const cwd = '/Users/home/folder';
				const absoluteFile = '/Users/home/folder/file.txt';
				fileService.setFiles([
					URI.from({ scheme: Schemas.file, path: absoluteFile }),
					URI.from({ scheme: Schemas.file, path: '/Users/home/folder/other/file.txt' })
				]);

				// Set a fake detected command starting as line 0 to establish the cwd
				commandDetection.setCommands([{
					command: '',
					isTrusted: true,
					cwd,
					timestamp: 0,
					getOutput() { return undefined; },
					getOutputMatch(outputMatcher: ITerminalOutputMatcher) { return undefined; },
					marker: {
						line: 0
					} as Partial<IXtermMarker> as any,
					hasOutput() { return true; },
					exitCode: 0,
					commandStartLineContent: '',
					markProperties: {}
				}]);
				await opener.open({
					text: 'file.txt',
					bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
					type: TerminalBuiltinLinkType.Search
				});
				deepStrictEqual(activationResult, {
					link: 'file:///Users/home/folder/file.txt',
					source: 'editor'
				});

				// Clear detected commands and ensure the same request results in a search since there are 2 matches
				commandDetection.setCommands([]);
				opener.setFileQueryBuilder({ file: () => null! });
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
					type: TerminalBuiltinLinkType.Search
				});
				deepStrictEqual(activationResult, {
					link: 'file.txt',
					source: 'search'
				});
			});

			test('should extract line and column from links in a workspace containing spaces', async () => {
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '/space folder', localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
				fileService.setFiles([
					URI.from({ scheme: Schemas.file, path: '/space folder/foo/bar.txt' })
				]);
				await opener.open({
					text: './foo/bar.txt:10:5',
					bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
					type: TerminalBuiltinLinkType.Search
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
			});
		});

		suite('Windows', () => {
			setup(() => {
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, '', localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
			});

			test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:\\Users', localFileOpener, localFolderOpener, () => OperatingSystem.Windows);

				const cwd = 'c:\\Users\\home\\folder';
				const absoluteFile = 'c:\\Users\\home\\folder\\file.txt';

				fileService.setFiles([
					URI.file('/c:/Users/home/folder/file.txt')
				]);

				// Set a fake detected command starting as line 0 to establish the cwd
				commandDetection.setCommands([{
					exitCode: 0,
					commandStartLineContent: '',
					markProperties: {},
					command: '',
					isTrusted: true,
					cwd,
					timestamp: 0,
					getOutput() { return undefined; },
					getOutputMatch(outputMatcher: ITerminalOutputMatcher) { return undefined; },
					marker: {
						line: 0
					} as Partial<IXtermMarker> as any,
					hasOutput() { return true; }
				}]);
				await opener.open({
					text: 'file.txt',
					bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
					type: TerminalBuiltinLinkType.Search
				});
				deepStrictEqual(activationResult, {
					link: 'file:///c%3A/Users/home/folder/file.txt',
					source: 'editor'
				});

				// Clear detected commands and ensure the same request results in a search
				commandDetection.setCommands([]);
				opener.setFileQueryBuilder({ file: () => null! });
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
					type: TerminalBuiltinLinkType.Search
				});
				deepStrictEqual(activationResult, {
					link: 'file.txt',
					source: 'search'
				});
			});

			test('should extract line and column from links in a workspace containing spaces', async () => {
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, 'c:/space folder', localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
				fileService.setFiles([
					URI.from({ scheme: Schemas.file, path: 'c:/space folder/foo/bar.txt' })
				]);
				await opener.open({
					text: './foo/bar.txt:10:5',
					bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
					type: TerminalBuiltinLinkType.Search
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
					text: '.\\foo\\bar.txt:10:5',
					bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
					type: TerminalBuiltinLinkType.Search
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
			});
		});
	});
});
