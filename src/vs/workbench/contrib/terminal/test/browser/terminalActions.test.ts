/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { NEW_TAB_BUTTON_SETTING } from '../../../../browser/parts/editor/newTabButton.js';
import { IEditorCommandsContext } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ICreateTerminalOptions, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { CreateTerminalEditorFromNewTabButtonAction, WorkspaceFolderCwdPair, shrinkWorkspaceFolderCwdPairs } from '../../browser/terminalActions.js';
import { TerminalContextKeys } from '../../common/terminalContextKey.js';

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

	suite('CreateTerminalEditorFromNewTabButtonAction', () => {
		test('is shown while the new tab button is on and terminal processes are supported', () => {
			const when = (new CreateTerminalEditorFromNewTabButtonAction().desc.menu as { readonly when?: ContextKeyExpression }).when;
			const shown = (newTabButton: boolean, processSupported: boolean) => {
				const values: Record<string, ContextKeyValue> = { [`config.${NEW_TAB_BUTTON_SETTING}`]: newTabButton, [TerminalContextKeys.processSupported.key]: processSupported };
				return !!when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext);
			};

			deepStrictEqual({ off: shown(false, true), noProcessSupport: shown(true, false), on: shown(true, true) }, { off: false, noProcessSupport: false, on: true });
		});

		test('opens a focused terminal editor after the last tab of the group of the button', async () => {
			const groups = [upcastPartial<IEditorGroup>({ id: 1, count: 1 }), upcastPartial<IEditorGroup>({ id: 2, count: 3 })];
			let activeGroup = groups[0];
			const calls: unknown[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
				getGroup: id => groups.find(group => group.id === id),
				getGroups: () => groups,
				get activeGroup() { return activeGroup; },
				activateGroup: group => activeGroup = group as IEditorGroup,
			}));
			instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({
				createTerminal: async (options?: ICreateTerminalOptions) => {
					calls.push({ createTerminal: options, activeGroup: activeGroup.id });
					return upcastPartial<ITerminalInstance>({ focusWhenReady: async () => { calls.push('focusWhenReady'); } });
				}
			}));

			// The button of the second, inactive group passes its group
			await instantiationService.invokeFunction(accessor => new CreateTerminalEditorFromNewTabButtonAction().run(accessor, { groupId: 2 } satisfies IEditorCommandsContext));

			deepStrictEqual(calls, [{ createTerminal: { location: { viewColumn: 1, index: 3 } }, activeGroup: 2 }, 'focusWhenReady']);
		});
	});
});
