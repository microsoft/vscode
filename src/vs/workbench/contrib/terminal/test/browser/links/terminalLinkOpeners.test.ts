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
import { TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalSearchLinkOpener } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkOpeners';
import { TerminalCapability, ITerminalCommand, IXtermMarker } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { Terminal } from 'xterm';

export interface ITerminalLinkActivationResult {
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
		} else {
			return { isFile: false, isDirectory: false, isSymbolicLink: false } as IFileStatWithPartialMetadata;
		}
	}
	setFiles(files: URI[] | '*'): void {
		this._files = files;
	}
}

suite('Workbench - TerminalLinkOpeners', () => {
	let instantiationService: TestInstantiationService;
	let fileService: TestFileService;
	let activationResult: ITerminalLinkActivationResult | undefined;
	let xterm: Terminal;

	setup(() => {
		instantiationService = new TestInstantiationService();
		fileService = new TestFileService(new NullLogService());
		instantiationService.set(IFileService, fileService);
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.set(IWorkspaceContextService, new TestContextService());
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
		// /*editorServiceSpy = */instantiationService.spy(IEditorService, 'openEditor');
		xterm = new Terminal({ allowProposedApi: true });
	});

	suite('TerminalSearchLinkOpener', () => {
		let opener: TerminalSearchLinkOpener;
		let capabilities: TerminalCapabilityStore;
		let commandDetection: TestCommandDetectionCapability;
		let localFileOpener: TerminalLocalFileLinkOpener;

		setup(() => {
			capabilities = new TerminalCapabilityStore();
			commandDetection = instantiationService.createInstance(TestCommandDetectionCapability, xterm);
			capabilities.add(TerminalCapability.CommandDetection, commandDetection);
		});

		test('should open single exact match against cwd when searching if it exists when command detection cwd is available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Linux);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve('/initial/cwd'), localFileOpener, localFolderOpener, OperatingSystem.Linux);
			// Set a fake detected command starting as line 0 to establish the cwd
			commandDetection.setCommands([{
				command: '',
				cwd: '/initial/cwd',
				timestamp: 0,
				getOutput() { return undefined; },
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
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Linux);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve('/initial/cwd'), localFileOpener, localFolderOpener, OperatingSystem.Linux);
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

		test('should not open single exact match for paths not containing a when command detection isn\'t available', async () => {
			localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Linux);
			const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
			opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve('/initial/cwd'), localFileOpener, localFolderOpener, OperatingSystem.Linux);
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
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Linux);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve(''), localFileOpener, localFolderOpener, OperatingSystem.Linux);
			});

			test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
				const cwd = '/Users/home/folder';
				const absoluteFile = '/Users/home/folder/file.txt';
				fileService.setFiles([
					URI.from({ scheme: Schemas.file, path: absoluteFile })
				]);

				// Set a fake detected command starting as line 0 to establish the cwd
				commandDetection.setCommands([{
					command: '',
					cwd,
					timestamp: 0,
					getOutput() { return undefined; },
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
					link: 'file:///Users/home/folder/file.txt',
					source: 'editor'
				});

				// Clear deteceted commands and ensure the same request results in a search
				commandDetection.setCommands([]);
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
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Linux);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve('/space folder'), localFileOpener, localFolderOpener, OperatingSystem.Linux);
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
						startLineNumber: 10
					},
				});
			});
		});

		suite('Windows', () => {
			setup(() => {
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Windows);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve(''), localFileOpener, localFolderOpener, OperatingSystem.Windows);
			});

			test('should apply the cwd to the link only when the file exists and cwdDetection is enabled', async () => {
				const cwd = 'c:\\Users\\home\\folder';
				const absoluteFile = 'c:\\Users\\home\\folder\\file.txt';
				fileService.setFiles([
					URI.from({ scheme: Schemas.file, path: absoluteFile })
				]);

				// Set a fake detected command starting as line 0 to establish the cwd
				commandDetection.setCommands([{
					command: '',
					cwd,
					timestamp: 0,
					getOutput() { return undefined; },
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

				// Clear deteceted commands and ensure the same request results in a search
				commandDetection.setCommands([]);
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
				localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener, OperatingSystem.Windows);
				const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
				opener = instantiationService.createInstance(TerminalSearchLinkOpener, capabilities, Promise.resolve('c:/space folder'), localFileOpener, localFolderOpener, OperatingSystem.Windows);
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
						startLineNumber: 10
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
						startLineNumber: 10
					},
				});
			});
		});
	});
});
