/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { ensureCodeWindow } from '../../../../../base/browser/window.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { WorkspaceFolderCwdPair, registerSplitTerminalAction, shrinkWorkspaceFolderCwdPairs } from '../../browser/terminalActions.js';
import { ICreateTerminalOptions, ITerminalConfigurationService, ITerminalEditingService, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../browser/terminal.js';
import { TerminalCommandId } from '../../common/terminal.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService, TestTerminalConfigurationService } from '../../../../test/browser/workbenchTestServices.js';

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
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const root: URI = URI.file('/some-root');
	const a = makeFakeFolder('a', URI.joinPath(root, 'a'));
	const b = makeFakeFolder('b', URI.joinPath(root, 'b'));
	const c = makeFakeFolder('c', URI.joinPath(root, 'c'));
	const d = makeFakeFolder('d', URI.joinPath(root, 'd'));

	test('split command prefers the terminal editor in the active auxiliary window', async () => {
		const auxiliaryResource = URI.parse('vscode-terminal:/auxiliary');
		const mainTerminal = new class extends mock<ITerminalInstance>() { }();
		const auxiliaryTerminal = new class extends mock<ITerminalInstance>() {
			override readonly resource = auxiliaryResource;
		}();
		const createdTerminal = new class extends mock<ITerminalInstance>() { }();
		let createLocation: ITerminalLocationOptions | undefined;
		const terminalService = new class extends mock<ITerminalService>() {
			override readonly activeInstance = mainTerminal;
			override getInstanceFromResource(resource: URI | undefined): ITerminalInstance | undefined {
				return resource?.toString() === auxiliaryResource.toString() ? auxiliaryTerminal : undefined;
			}
			override async getInstanceHost() { return this; }
			override async createTerminal(options?: ICreateTerminalOptions) {
				createLocation = options?.location;
				return createdTerminal;
			}
			override async focusInstance() { }
		}();
		const activeEditor = upcastPartial<EditorInput>({ resource: auxiliaryResource });
		const activeGroup = new class extends mock<IEditorGroup>() {
			override readonly activeEditor = activeEditor;
		}();
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add({ dispose: () => iframe.remove() });
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 2);
		const auxiliaryWindowId = auxiliaryWindow.vscodeWindowId;
		const auxiliaryPart = new class extends mock<IEditorPart>() {
			override readonly windowId = auxiliaryWindowId;
			override readonly activeGroup = activeGroup;
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override readonly parts = [auxiliaryPart];
		}();
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ITerminalService, terminalService);
		instantiationService.stub(IEditorGroupsService, editorGroupsService);
		instantiationService.stub(ITerminalEditingService, new class extends mock<ITerminalEditingService>() { }());
		const terminalConfigurationService = instantiationService.invokeFunction(accessor => accessor.get(ITerminalConfigurationService)) as TestTerminalConfigurationService;
		terminalConfigurationService.setConfig({ splitCwd: 'workspaceRoot' });
		store.add(registerSplitTerminalAction(() => auxiliaryWindow));
		const splitCommand = CommandsRegistry.getCommand(TerminalCommandId.Split);
		ok(splitCommand);

		await instantiationService.invokeFunction(accessor => splitCommand.handler(accessor));

		deepStrictEqual(createLocation, { parentTerminal: auxiliaryTerminal });
	});

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
});
