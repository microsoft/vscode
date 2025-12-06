/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../../base/common/event.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ServicesAccessor, ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IExplorerService } from '../../../files/browser/files.js';
import { VIEW_ID as EXPLORER_VIEW_ID } from '../../../files/common/files.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../../common/terminal.js';
import { WorkspaceFolderCwdPair, shrinkWorkspaceFolderCwdPairs } from '../../browser/terminalActions.js';

function makeFakeFolder(name: string, uri: URI): IWorkspaceFolder {
	return {
		name,
		uri,
		index: 0,
		toResource: () => uri,
	};
}

function makePair(folder: IWorkspaceFolder, cwd?: URI | IWorkspaceFolder, isAbsolute?: boolean): WorkspaceFolderCwdPair {
	return {
		folder,
		cwd: !cwd ? folder.uri : (cwd instanceof URI ? cwd : cwd.uri),
		isAbsolute: !!isAbsolute,
		isOverridden: !!cwd && cwd.toString() !== folder.uri.toString(),
	};
}

suite('terminalActions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const root: URI = URI.file('/some-root');
	const a = makeFakeFolder('a', URI.joinPath(root, 'a'));
	const b = makeFakeFolder('b', URI.joinPath(root, 'b'));
	const c = makeFakeFolder('c', URI.joinPath(root, 'c'));
	const d = makeFakeFolder('d', URI.joinPath(root, 'd'));

	suite('shrinkWorkspaceFolderCwdPairs', () => {
		test('should return empty when given array is empty', () => {
			deepStrictEqual(shrinkWorkspaceFolderCwdPairs([]), []);
		});

		test('should return the only single pair when given argument is a single element array', () => {
			const pairs = [makePair(a)];
			deepStrictEqual(shrinkWorkspaceFolderCwdPairs(pairs), pairs);
		});

		test('should return all pairs when no repeated cwds', () => {
			const pairs = [makePair(a), makePair(b), makePair(c)];
			deepStrictEqual(shrinkWorkspaceFolderCwdPairs(pairs), pairs);
		});

		suite('should select the pair that has the same URI when repeated cwds exist', () => {
			test('all repeated', () => {
				const pairA = makePair(a);
				const pairB = makePair(b, a); // CWD points to A
				const pairC = makePair(c, a); // CWD points to A
				deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC]), [pairA]);
			});

			test('two repeated + one different', () => {
				const pairA = makePair(a);
				const pairB = makePair(b, a); // CWD points to A
				const pairC = makePair(c);
				deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC]), [pairA, pairC]);
			});

			test('two repeated + two repeated', () => {
				const pairA = makePair(a);
				const pairB = makePair(b, a); // CWD points to A
				const pairC = makePair(c);
				const pairD = makePair(d, c);
				deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC, pairD]), [pairA, pairC]);
			});

			test('two repeated + two repeated (reverse order)', () => {
				const pairB = makePair(b, a); // CWD points to A
				const pairA = makePair(a);
				const pairD = makePair(d, c);
				const pairC = makePair(c);
				deepStrictEqual(shrinkWorkspaceFolderCwdPairs([pairA, pairB, pairC, pairD]), [pairA, pairC]);
			});
		});
	});

	suite('RevealCwdInExplorer', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		let services: Map<ServiceIdentifier<unknown>, unknown>;
		let accessor: ServicesAccessor;
		let notificationService: TestNotificationService;
		let infoSpy: sinon.SinonSpy;
		let workspaceContextService: IWorkspaceContextService;
		let getWorkspaceFolderStub: sinon.SinonStub<[URI], IWorkspaceFolder | null>;
		let viewsService: IViewsService;
		let explorerService: IExplorerService;
		let terminalService: ITerminalService;
		let activeTerminal: ITerminalInstance | undefined;

		function createAccessor(collection: Map<ServiceIdentifier<unknown>, unknown>): ServicesAccessor {
			return {
				get: <T>(id: ServiceIdentifier<T>): T => {
					if (!collection.has(id)) {
						throw new Error(`Service not registered in test: ${id.toString?.()}`);
					}
					return collection.get(id) as T;
				},
				getIfExists: <T>(id: ServiceIdentifier<T>): T | undefined => {
					return collection.get(id) as T | undefined;
				}
			};
		}

		function registerService<T>(id: ServiceIdentifier<T>, instance: T): void {
			services.set(id, instance);
		}

		function createMockWorkspaceFolder(name: string, uri: URI): IWorkspaceFolder {
			return {
				name,
				uri,
				index: 0,
				toResource: (relativePath: string) => URI.joinPath(uri, relativePath),
			};
		}

		function createTerminalInstance(cwd: string | undefined): ITerminalInstance {
			return {
				async getCwdResource(): Promise<URI | undefined> {
					if (!cwd) {
						return undefined;
					}
					return URI.file(cwd);
				}
			} as unknown as ITerminalInstance;
		}

		async function runRevealCommand(): Promise<void> {
			const command = CommandsRegistry.getCommand(TerminalCommandId.RevealCwdInExplorer);
			if (!command || typeof command.handler !== 'function') {
				throw new Error('RevealCwdInExplorer command is not registered');
			}
			await command.handler(accessor);
		}

		setup(() => {
			sinon.restore();

			services = new Map<ServiceIdentifier<unknown>, unknown>();
			notificationService = new TestNotificationService();
			infoSpy = sinon.spy(notificationService, 'info');

			getWorkspaceFolderStub = sinon.stub<[URI], IWorkspaceFolder | null>();
			const emptyWorkspace: IWorkspace = { id: 'test-workspace', folders: [] };
			workspaceContextService = {
				_serviceBrand: undefined,
				onDidChangeWorkbenchState: Event.None,
				onDidChangeWorkspaceName: Event.None,
				onWillChangeWorkspaceFolders: Event.None,
				onDidChangeWorkspaceFolders: Event.None,
				getCompleteWorkspace: () => Promise.resolve(emptyWorkspace),
				getWorkspace: () => emptyWorkspace,
				getWorkbenchState: () => WorkbenchState.FOLDER,
				getWorkspaceFolder: getWorkspaceFolderStub,
				isCurrentWorkspace: () => false,
				isInsideWorkspace: () => false
			};

			viewsService = {
				openView: sinon.stub().resolves(undefined)
			} as unknown as IViewsService;

			explorerService = {
				select: sinon.stub().resolves(undefined)
			} as unknown as IExplorerService;

			activeTerminal = undefined;
			terminalService = {
				get activeInstance() { return activeTerminal; }
			} as unknown as ITerminalService;

			registerService(INotificationService, notificationService);
			registerService(IWorkspaceContextService, workspaceContextService);
			registerService(IViewsService, viewsService);
			registerService(IExplorerService, explorerService);
			registerService(ITerminalService, terminalService as ITerminalService);
			registerService(ITerminalConfigurationService, {} as unknown as ITerminalConfigurationService);
			registerService(ITerminalGroupService, {} as unknown as ITerminalGroupService);
			registerService(ITerminalInstanceService, {} as unknown as ITerminalInstanceService);
			registerService(ITerminalEditorService, {} as unknown as ITerminalEditorService);
			registerService(ITerminalEditingService, {} as unknown as ITerminalEditingService);
			registerService(ITerminalProfileService, {} as unknown as ITerminalProfileService);
			registerService(ITerminalProfileResolverService, {} as unknown as ITerminalProfileResolverService);

			accessor = createAccessor(services);
		});

		teardown(() => {
			sinon.restore();
		});

		suite('path normalization', () => {
			test('should create valid URI for POSIX paths', () => {
				const posixPath = '/workspace/project/src';
				const uri = URI.file(posixPath);
				strictEqual(uri.scheme, 'file');
				strictEqual(uri.fsPath, posixPath);
			});

			test('should create valid URI for Windows paths', function () {
				const windowsPath = 'C:\\Users\\dev\\project\\src';
				const uri = URI.file(windowsPath);
				strictEqual(uri.scheme, 'file');
				if (isWindows) {
					strictEqual(uri.fsPath, windowsPath);
				} else {
					strictEqual(uri.path, '/C:/Users/dev/project/src');
				}
			});
		});

		suite('workspace mapping', () => {
			test('should return workspace folder when CWD is inside workspace', () => {
				const workspaceRoot = URI.file('/workspace/project');
				const workspaceFolder = createMockWorkspaceFolder('project', workspaceRoot);
				const cwdUri = URI.joinPath(workspaceRoot, 'src');

				getWorkspaceFolderStub.withArgs(cwdUri).returns(workspaceFolder);

				const result = workspaceContextService.getWorkspaceFolder(cwdUri);
				strictEqual(result, workspaceFolder);
			});

			test('should return null when CWD is outside workspace', () => {
				const cwdUri = URI.file('/outside/workspace/path');
				getWorkspaceFolderStub.withArgs(cwdUri).returns(null);

				const result = workspaceContextService.getWorkspaceFolder(cwdUri);
				strictEqual(result, null);
			});
		});

		suite('command behaviour', () => {
			test('should notify when no active terminal exists', async () => {
				activeTerminal = undefined;

				await runRevealCommand();

				sinon.assert.calledOnce(infoSpy);
				sinon.assert.calledWithMatch(infoSpy, sinon.match('No active terminal is available'));
				sinon.assert.notCalled((viewsService.openView as sinon.SinonStub));
				sinon.assert.notCalled((explorerService.select as sinon.SinonStub));
			});

			test('should notify when active terminal has no cwd capability', async () => {
				activeTerminal = createTerminalInstance(undefined);

				await runRevealCommand();

				sinon.assert.calledOnce(infoSpy);
				sinon.assert.calledWithMatch(infoSpy, sinon.match('Unable to determine the terminal\'s current working directory'));
				sinon.assert.notCalled((viewsService.openView as sinon.SinonStub));
				sinon.assert.notCalled((explorerService.select as sinon.SinonStub));
			});

			test('should notify when cwd is outside workspace', async () => {
				const cwd = '/outside/project';
				const cwdUri = URI.file(cwd);
				activeTerminal = createTerminalInstance(cwd);
				getWorkspaceFolderStub.withArgs(cwdUri).returns(null);

				await runRevealCommand();

				sinon.assert.calledOnce(infoSpy);
				sinon.assert.calledWithMatch(infoSpy, sinon.match('not inside the current workspace'));
				sinon.assert.notCalled((viewsService.openView as sinon.SinonStub));
				sinon.assert.notCalled((explorerService.select as sinon.SinonStub));
			});

			test('should reveal POSIX cwd inside explorer when inside workspace', async () => {
				const workspaceRoot = URI.file('/workspace/project');
				const cwd = URI.joinPath(workspaceRoot, 'src/components');
				const workspaceFolder = createMockWorkspaceFolder('project', workspaceRoot);

				activeTerminal = createTerminalInstance(cwd.fsPath);
				getWorkspaceFolderStub.callsFake((uri: URI) => uri.toString() === cwd.toString() ? workspaceFolder : null);

				await runRevealCommand();

				sinon.assert.notCalled(infoSpy);
				sinon.assert.calledOnce((viewsService.openView as sinon.SinonStub));
				sinon.assert.calledWithExactly((viewsService.openView as sinon.SinonStub), EXPLORER_VIEW_ID, false);
				sinon.assert.calledOnce((explorerService.select as sinon.SinonStub));
				const [selectedUri, revealType] = (explorerService.select as sinon.SinonStub).getCall(0).args;
				strictEqual(selectedUri.toString(), cwd.toString());
				strictEqual(revealType, 'force');
			});

			test('should reveal Windows cwd inside explorer when inside workspace', async function () {
				if (!isWindows) {
					this.skip();
				}

				const workspaceRoot = URI.file('C:\\Users\\dev\\project');
				const cwdPath = 'C:\\Users\\dev\\project\\src';
				const cwdUri = URI.file(cwdPath);
				const workspaceFolder = createMockWorkspaceFolder('project', workspaceRoot);

				activeTerminal = createTerminalInstance(cwdPath);
				getWorkspaceFolderStub.callsFake((uri: URI) => uri.toString() === cwdUri.toString() ? workspaceFolder : null);

				await runRevealCommand();

				sinon.assert.notCalled(infoSpy);
				sinon.assert.calledOnce((explorerService.select as sinon.SinonStub));
				const [selectedUri] = (explorerService.select as sinon.SinonStub).getCall(0).args;
				strictEqual(selectedUri.fsPath, cwdPath);
			});
		});
	});
});
