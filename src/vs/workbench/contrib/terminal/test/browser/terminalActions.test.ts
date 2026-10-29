/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { SinonSpy, spy } from 'sinon';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TerminalIcon } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import '../../browser/terminal.contribution.js';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../../common/terminal.js';
import { WorkspaceFolderCwdPair, shrinkWorkspaceFolderCwdPairs } from '../../browser/terminalActions.js';
import { getInstanceFromResource } from '../../browser/terminalUri.js';

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

	suite('terminal command target selection', () => {
		let instantiationService: TestInstantiationService;
		let instances: ITerminalInstance[];
		let groups: ITerminalGroup[];
		let activeGroup: ITerminalGroup | undefined;
		let activeInstance: ITerminalInstance | undefined;
		let renames: { terminalId: number; name: string }[];
		let iconChanges: { terminalId: number; icon: TerminalIcon | null | undefined }[];
		let colorChanges: { terminalId: number; color: string | undefined; skipQuickPick: boolean | undefined }[];
		let warning: SinonSpy;

		setup(() => {
			instantiationService = store.add(new TestInstantiationService());
			renames = [];
			iconChanges = [];
			colorChanges = [];
			instances = [3, 12, 21, 99].map(id => new class extends mock<ITerminalInstance>() {
				override readonly instanceId = id;
				override readonly title = 'Shell';
				// A terminal moved from another window can retain a resource with a different ID.
				override readonly resource = URI.parse(id === 99 ? 'vscode-terminal:/previous-workspace/7' : `vscode-terminal:/workspace/${id}`);
				override rename(name: string): void { renames.push({ terminalId: id, name }); }
				override async changeIcon(icon?: TerminalIcon | null) { iconChanges.push({ terminalId: id, icon }); return icon; }
				override async changeColor(color?: string, skipQuickPick?: boolean) { colorChanges.push({ terminalId: id, color, skipQuickPick }); return color; }
			}());
			groups = [
				new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = instances.slice(0, 2);
					override activeInstance = instances[1];
				}(),
				new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = [instances[2]];
					override activeInstance = instances[2];
				}()
			];
			activeInstance = instances[2];
			activeGroup = groups[1];
			instantiationService.stub(ITerminalService, {
				get activeInstance() { return activeInstance; },
				getInstanceFromId: id => instances.find(instance => instance.instanceId === id),
				getInstanceFromResource: resource => getInstanceFromResource(instances, resource)
			});
			instantiationService.stub(ITerminalGroupService, {
				get groups() { return groups; },
				get activeGroup() { return activeGroup; }
			});
			instantiationService.stub(ITerminalConfigurationService, {});
			instantiationService.stub(ITerminalInstanceService, {});
			instantiationService.stub(ITerminalEditorService, {});
			instantiationService.stub(ITerminalEditingService, {});
			instantiationService.stub(ITerminalProfileService, {});
			instantiationService.stub(ITerminalProfileResolverService, {});
			const notificationService = new TestNotificationService();
			warning = spy(notificationService, 'warn');
			instantiationService.stub(INotificationService, notificationService);
		});

		teardown(() => warning.restore());

		async function runCommand(id: TerminalCommandId, args: unknown): Promise<void> {
			const command = CommandsRegistry.getCommand(id);
			ok(command);
			await instantiationService.invokeFunction(accessor => command.handler(accessor, args));
		}

		async function rename(args: unknown): Promise<void> {
			await runCommand(TerminalCommandId.RenameWithArgs, args);
		}

		const selections = [
			{ title: 'preserves the active-terminal default', selector: {}, terminalId: 21 },
			{ title: 'selects a background split by instance ID', selector: { terminalId: 12 }, terminalId: 12 },
			{ title: 'selects a background split by resource', selector: { resource: 'vscode-terminal:/workspace/12' }, terminalId: 12 },
			{ title: 'ignores the resource title fragment when resolving identity', selector: { resource: 'vscode-terminal:/workspace/12#Previous title' }, terminalId: 12 },
			{ title: 'resolves a moved terminal by its original resource', selector: { resource: 'vscode-terminal:/previous-workspace/7' }, terminalId: 99 },
			{ title: 'selects an editor terminal by its current instance ID', selector: { terminalId: 99 }, terminalId: 99 },
			{ title: 'uses the selected tab active split when split is omitted', selector: { tab: 1 }, terminalId: 12 },
			{ title: 'uses 1-based tab positions', selector: { tab: 2 }, terminalId: 21 },
			{ title: 'uses the active tab when only split is provided', selector: { split: 1 }, terminalId: 21 },
			{ title: 'selects the first split explicitly', selector: { tab: 1, split: 1 }, terminalId: 3 },
			{ title: 'selects the second split explicitly', selector: { tab: 1, split: 2 }, terminalId: 12 },
			{ title: 'accepts split 1 in an unsplit tab', selector: { tab: 2, split: 1 }, terminalId: 21 }
		];
		for (const { title, selector, terminalId } of selections) {
			test(title, async () => {
				await rename({ name: 'Build logs', ...selector });
				deepStrictEqual({ renames, activeId: activeInstance?.instanceId, groupActiveIds: groups.map(group => group.activeInstance?.instanceId), warnings: warning.callCount }, {
					renames: [{ terminalId, name: 'Build logs' }], activeId: 21, groupActiveIds: [12, 21], warnings: 0
				});
			});

			test(`changeIcon ${title}`, async () => {
				await runCommand(TerminalCommandId.ChangeIcon, { icon: '$(rocket)', ...selector });
				deepStrictEqual({ iconChanges, activeId: activeInstance?.instanceId, groupActiveIds: groups.map(group => group.activeInstance?.instanceId), warnings: warning.callCount }, {
					iconChanges: [{ terminalId, icon: { id: 'rocket' } }], activeId: 21, groupActiveIds: [12, 21], warnings: 0
				});
			});

			test(`changeColor ${title}`, async () => {
				await runCommand(TerminalCommandId.ChangeColor, { color: 'terminal.ansiRed', skipQuickPick: false, ...selector });
				deepStrictEqual({ colorChanges, activeId: activeInstance?.instanceId, groupActiveIds: groups.map(group => group.activeInstance?.instanceId), warnings: warning.callCount }, {
					colorChanges: [{ terminalId, color: 'terminal.ansiRed', skipQuickPick: false }], activeId: 21, groupActiveIds: [12, 21], warnings: 0
				});
			});
		}

		test('opens the icon and color pickers for a background split', async () => {
			await runCommand(TerminalCommandId.ChangeIcon, { tab: 1, split: 1 });
			await runCommand(TerminalCommandId.ChangeColor, { tab: 1, split: 1 });
			deepStrictEqual({ iconChanges, colorChanges, activeId: activeInstance?.instanceId, warnings: warning.callCount }, {
				iconChanges: [{ terminalId: 3, icon: undefined }],
				colorChanges: [{ terminalId: 3, color: undefined, skipQuickPick: undefined }],
				activeId: 21, warnings: 0
			});
		});

		test('accepts a plain icon ID with a target', async () => {
			await runCommand(TerminalCommandId.ChangeIcon, { icon: 'rocket', terminalId: 12 });
			deepStrictEqual(iconChanges, [{ terminalId: 12, icon: { id: 'rocket' } }]);
		});

		test('resets a selected terminal color without showing the picker', async () => {
			await runCommand(TerminalCommandId.ChangeColor, { terminalId: 12, skipQuickPick: true });
			deepStrictEqual(colorChanges, [{ terminalId: 12, color: undefined, skipQuickPick: true }]);
		});

		test('ignores invalid appearance values while preserving the selected target', async () => {
			await runCommand(TerminalCommandId.ChangeIcon, { terminalId: 12, icon: 42 });
			await runCommand(TerminalCommandId.ChangeColor, { terminalId: 12, color: 42, skipQuickPick: 'true' });
			deepStrictEqual({ iconChanges, colorChanges }, {
				iconChanges: [{ terminalId: 12, icon: undefined }],
				colorChanges: [{ terminalId: 12, color: undefined, skipQuickPick: undefined }]
			});
		});

		test('changes appearance on an explicit target without an active terminal', async () => {
			activeInstance = undefined;
			await runCommand(TerminalCommandId.ChangeIcon, { icon: 'rocket', terminalId: 12 });
			await runCommand(TerminalCommandId.ChangeColor, { color: 'terminal.ansiRed', terminalId: 12 });
			deepStrictEqual({ iconChanges, colorChanges, activeInstance, warnings: warning.callCount }, {
				iconChanges: [{ terminalId: 12, icon: { id: 'rocket' } }],
				colorChanges: [{ terminalId: 12, color: 'terminal.ansiRed', skipQuickPick: undefined }],
				activeInstance: undefined, warnings: 0
			});
		});

		test('selects a background split in the active tab without changing focus', async () => {
			activeGroup = groups[0];
			activeInstance = instances[1];
			await rename({ name: 'Background pane', split: 1 });
			deepStrictEqual({ renames, activeId: activeInstance.instanceId, groupActiveId: activeGroup.activeInstance?.instanceId, warnings: warning.callCount }, {
				renames: [{ terminalId: 3, name: 'Background pane' }], activeId: 12, groupActiveId: 12, warnings: 0
			});
		});

		test('does not fall back to an active terminal when no panel tab is active', async () => {
			activeGroup = undefined;
			await rename({ name: 'Missing panel tab', split: 1 });
			deepStrictEqual({ renames, warnings: warning.callCount }, { renames: [], warnings: 1 });
		});

		test('resolves tab positions after reordering', async () => {
			groups.reverse();
			await rename({ name: 'Reordered tab', tab: 1 });
			deepStrictEqual(renames, [{ terminalId: 21, name: 'Reordered tab' }]);
		});

		test('renames an explicit target without an active terminal', async () => {
			activeInstance = undefined;
			await rename({ name: 'Background', terminalId: 12 });
			deepStrictEqual({ renames, activeInstance, warnings: warning.callCount }, {
				renames: [{ terminalId: 12, name: 'Background' }], activeInstance: undefined, warnings: 0
			});
		});

		test('does nothing without a selector or active terminal', async () => {
			activeInstance = undefined;
			await rename({ name: 'No target' });
			deepStrictEqual({ renames, warnings: warning.callCount }, { renames: [], warnings: 0 });
		});

		test('does not fall back when an explicit target has closed', async () => {
			const resource = instances[1].resource.toString();
			instances = instances.filter(instance => instance.instanceId !== 12);
			await rename({ name: 'Closed terminal', resource });
			deepStrictEqual({ renames, activeId: activeInstance?.instanceId, warnings: warning.callCount }, { renames: [], activeId: 21, warnings: 1 });
		});

		const invalidSelectors = [
			{ terminalId: 404 }, { terminalId: 0 }, { terminalId: -1 }, { terminalId: 1.2 }, { terminalId: '12' },
			{ terminalId: NaN }, { terminalId: Infinity }, { terminalId: Number.MAX_SAFE_INTEGER + 1 },
			{ resource: 'vscode-terminal:/workspace/404' }, { resource: 'vscode-terminal:/wrong-workspace/12' },
			{ resource: 'file:/workspace/12' }, { resource: '/workspace/12' }, { resource: 'vscode-terminal:/%' },
			{ resource: '' }, { resource: 12 }, { resource: null },
			{ tab: 0 }, { tab: -1 }, { tab: 1.1 }, { tab: '1' }, { tab: 3 },
			{ tab: 1, split: 0 }, { tab: 1, split: -1 }, { tab: 1, split: 1.2 }, { tab: 1, split: '2' }, { tab: 1, split: 3 },
			{ split: 0 }, { split: -1 }, { split: 1.2 }, { split: '2' }, { split: 2 },
			{ terminalId: 12, split: 1 }, { resource: 'vscode-terminal:/workspace/12', split: 1 },
			{ terminalId: 12, tab: 1 }, { terminalId: 12, resource: 'vscode-terminal:/workspace/12' },
			{ resource: 'vscode-terminal:/workspace/12', tab: 1 }
		];
		for (const selector of invalidSelectors) {
			test(`rejects selector ${JSON.stringify(selector, (_, value) => typeof value === 'number' && !Number.isFinite(value) ? String(value) : value)} without renaming the active terminal`, async () => {
				await rename({ name: 'Wrong terminal', ...selector });
				await runCommand(TerminalCommandId.ChangeIcon, { icon: 'rocket', ...selector });
				await runCommand(TerminalCommandId.ChangeColor, { color: 'terminal.ansiRed', ...selector });
				deepStrictEqual({ renames, iconChanges, colorChanges, activeId: activeInstance?.instanceId, warnings: warning.callCount }, {
					renames: [], iconChanges: [], colorChanges: [], activeId: 21, warnings: 3
				});
			});
		}

		for (const args of [undefined, null, 'Build logs', [], {}, { name: '' }, { name: 12 }, { name: '', terminalId: 12 }]) {
			test(`rejects missing or invalid name in ${JSON.stringify(args)}`, async () => {
				await rename(args);
				deepStrictEqual({ renames, warnings: warning.callCount }, { renames: [], warnings: 1 });
			});
		}
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
