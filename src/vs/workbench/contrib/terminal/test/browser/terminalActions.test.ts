/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalIcon } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import '../../browser/terminal.contribution.js';
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
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const root: URI = URI.file('/some-root');
	const a = makeFakeFolder('a', URI.joinPath(root, 'a'));
	const b = makeFakeFolder('b', URI.joinPath(root, 'b'));
	const c = makeFakeFolder('c', URI.joinPath(root, 'c'));
	const d = makeFakeFolder('d', URI.joinPath(root, 'd'));

	suite('icon and color command arguments', () => {
		let instantiationService: TestInstantiationService;
		let activeInstance: ITerminalInstance | undefined;
		let iconChanges: (TerminalIcon | null | undefined)[];
		let colorChanges: [string | undefined, boolean | undefined][];
		const resource = URI.parse('vscode-terminal:/workspace/1');
		let resourceIconChanges: (TerminalIcon | null | undefined)[];
		let resourceColorChanges: [string | undefined, boolean | undefined][];

		setup(() => {
			instantiationService = store.add(new TestInstantiationService());
			iconChanges = [];
			colorChanges = [];
			resourceIconChanges = [];
			resourceColorChanges = [];
			activeInstance = new class extends mock<ITerminalInstance>() {
				override async changeIcon(icon?: TerminalIcon | null) { iconChanges.push(icon); return icon; }
				override async changeColor(color?: string, skipQuickPick?: boolean) { colorChanges.push([color, skipQuickPick]); return color; }
			}();
			const resourceInstance = new class extends mock<ITerminalInstance>() {
				override async changeIcon(icon?: TerminalIcon | null) { resourceIconChanges.push(icon); return icon; }
				override async changeColor(color?: string, skipQuickPick?: boolean) { resourceColorChanges.push([color, skipQuickPick]); return color; }
			}();
			instantiationService.stub(ITerminalService, {
				get activeInstance() { return activeInstance; },
				getInstanceFromResource: uri => uri?.toString() === resource.toString() ? resourceInstance : undefined
			});
			instantiationService.stub(ITerminalConfigurationService, {});
			instantiationService.stub(ITerminalGroupService, {});
			instantiationService.stub(ITerminalInstanceService, {});
			instantiationService.stub(ITerminalEditorService, {});
			instantiationService.stub(ITerminalEditingService, {});
			instantiationService.stub(ITerminalProfileService, {});
			instantiationService.stub(ITerminalProfileResolverService, {});
		});

		async function runCommand(id: TerminalCommandId, ...args: unknown[]): Promise<void> {
			const command = CommandsRegistry.getCommand(id);
			ok(command);
			await instantiationService.invokeFunction(accessor => command.handler(accessor, ...args));
		}

		const iconCases: { name: string; args: unknown[]; expected: ThemeIcon | undefined }[] = [
			{ name: 'accepts a plain icon ID', args: ['rocket'], expected: { id: 'rocket' } },
			{ name: 'accepts icon syntax', args: ['$(rocket)'], expected: { id: 'rocket' } },
			{ name: 'accepts an icon modifier', args: ['$(sync~spin)'], expected: { id: 'sync~spin' } },
			{ name: 'opens the icon picker without arguments', args: [], expected: undefined },
			{ name: 'ignores a non-string icon', args: [42], expected: undefined }
		];
		for (const { name, args, expected } of iconCases) {
			test(name, async () => {
				await runCommand(TerminalCommandId.ChangeIcon, ...args);
				deepStrictEqual(iconChanges, [expected]);
			});
		}

		const colorCases: { name: string; args: unknown[]; expected: [string | undefined, boolean | undefined] }[] = [
			{ name: 'accepts a color ID', args: ['terminal.ansiRed'], expected: ['terminal.ansiRed', undefined] },
			{ name: 'forwards skipQuickPick', args: ['terminal.ansiRed', true], expected: ['terminal.ansiRed', true] },
			{ name: 'preserves an explicit false skipQuickPick', args: ['terminal.ansiRed', false], expected: ['terminal.ansiRed', false] },
			{ name: 'resets the color without opening the picker', args: [undefined, true], expected: [undefined, true] },
			{ name: 'opens the color picker without arguments', args: [], expected: [undefined, undefined] },
			{ name: 'ignores a non-string color', args: [42, true], expected: [undefined, true] },
			{ name: 'ignores a non-boolean skipQuickPick', args: ['terminal.ansiRed', 'true'], expected: ['terminal.ansiRed', undefined] }
		];
		for (const { name, args, expected } of colorCases) {
			test(name, async () => {
				await runCommand(TerminalCommandId.ChangeColor, ...args);
				deepStrictEqual(colorChanges, [expected]);
			});
		}

		test('preserves resource targeting for both commands', async () => {
			await runCommand(TerminalCommandId.ChangeIcon, resource);
			await runCommand(TerminalCommandId.ChangeColor, resource, true);
			deepStrictEqual({ iconChanges, colorChanges, resourceIconChanges, resourceColorChanges }, {
				iconChanges: [], colorChanges: [], resourceIconChanges: [undefined], resourceColorChanges: [[undefined, true]]
			});
		});

		test('does nothing when there is no active terminal', async () => {
			activeInstance = undefined;
			await runCommand(TerminalCommandId.ChangeIcon, 'rocket');
			await runCommand(TerminalCommandId.ChangeColor, 'terminal.ansiRed', true);
			deepStrictEqual({ iconChanges, colorChanges }, { iconChanges: [], colorChanges: [] });
		});
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
