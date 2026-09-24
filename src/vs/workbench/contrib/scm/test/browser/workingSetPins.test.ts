/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IUntypedEditorInput } from '../../../../common/editor.js';
import type { EditorInput } from '../../../../common/editor/editorInput.js';
import type { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import type { IEditorService } from '../../../../services/editor/common/editorService.js';
import { applyWorkingSetWithPinnedEditors } from '../../browser/workingSetPins.js';

interface ITestEditor extends EditorInput {
	readonly testId: string;
	setDisposed(): void;
}

interface ITestGroup {
	readonly id: number;
	readonly editors: EditorInput[];
	readonly sticky: Set<string>;
	readonly closed: string[];
	readonly opened: string[];
	vetoClose: boolean;
	isSticky(editor: EditorInput): boolean;
	stickEditor(editor: EditorInput): void;
	closeEditor(editor: EditorInput): Promise<boolean>;
	openEditor(editor: EditorInput, options?: { sticky?: boolean }): Promise<undefined>;
}

function testEditor(id: string, untyped = true): ITestEditor {
	let disposed = false;
	return {
		testId: id,
		matches(other: EditorInput | IUntypedEditorInput): boolean {
			const candidate = other as { testId?: string; resource?: { path?: string } };
			return (candidate.testId ?? candidate.resource?.path) === id;
		},
		toUntyped(): IUntypedEditorInput | undefined {
			return untyped ? { resource: { path: id } } as IUntypedEditorInput : undefined;
		},
		isDisposed: () => disposed,
		setDisposed: () => { disposed = true; }
	} as ITestEditor;
}

function testGroup(id: number, editors: ReadonlyArray<[string, boolean]>): ITestGroup {
	const group: ITestGroup = {
		id,
		editors: editors.map(([name]) => testEditor(name)),
		sticky: new Set(editors.filter(([, sticky]) => sticky).map(([name]) => name)),
		closed: [],
		opened: [],
		vetoClose: false,
		isSticky(editor) { return group.sticky.has((editor as ITestEditor).testId); },
		stickEditor(editor) { group.sticky.add((editor as ITestEditor).testId); },
		async closeEditor(editor) {
			if (group.vetoClose) {
				return false;
			}
			const name = (editor as ITestEditor).testId;
			group.closed.push(name);
			group.sticky.delete(name);
			group.editors.splice(group.editors.indexOf(editor), 1);
			return true;
		},
		async openEditor(editor, options) {
			group.editors.push(editor);
			group.opened.push((editor as ITestEditor).testId);
			if (options?.sticky) {
				group.stickEditor(editor);
			}
			return undefined;
		}
	};
	return group;
}

function testServices(initial: ITestGroup[], restored: ITestGroup[], applySucceeds = true, disposeOnApply = true) {
	let groups = initial;
	const applications: Array<{ workingSet: string; preserveFocus: boolean | undefined }> = [];
	const opened: Array<{ name: string; groupId: number; sticky: boolean | undefined; inactive: boolean | undefined; preserveFocus: boolean | undefined }> = [];
	const editorGroupsService = {
		get groups() { return groups; },
		get activeGroup() { return groups[0]; },
		getGroup(id: number) { return groups.find(group => group.id === id); },
		async applyWorkingSet(workingSet: { id: string } | 'empty', options?: { preserveFocus?: boolean }) {
			applications.push({ workingSet: workingSet === 'empty' ? 'empty' : workingSet.id, preserveFocus: options?.preserveFocus });
			if (!applySucceeds) { return false; }
			if (disposeOnApply) {
				for (const group of groups) {
					for (const editor of group.editors) { (editor as ITestEditor).setDisposed(); }
				}
			}
			groups = restored;
			return true;
		}
	} as unknown as IEditorGroupsService;
	const editorService = {
		async openEditor(untyped: IUntypedEditorInput, groupId: number) {
			const name = (untyped as { resource?: { path?: string } }).resource?.path ?? '';
			const group = groups.find(group => group.id === groupId)!;
			opened.push({ name, groupId, sticky: untyped.options?.sticky, inactive: untyped.options?.inactive, preserveFocus: untyped.options?.preserveFocus });
			await group.openEditor(testEditor(name), untyped.options);
			return undefined;
		}
	} as unknown as IEditorService;
	return { editorGroupsService, editorService, applications, opened, get groups() { return groups; } };
}

suite('SCM working sets - pinned editors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('switches between saved branches, preserving pinned tabs and only the target unpinned tabs', async () => {
		const a = testGroup(1, [['pinned.ts', true], ['a.ts', false]]);
		const b = testGroup(1, [['old-pin.ts', true], ['b.ts', false]]);
		const services = testServices([a], [b]);

		assert.strictEqual(await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'branch-b', name: 'branch-b' }, true, true), true);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['b.ts', 'pinned.ts']);
		assert.deepStrictEqual(b.closed, ['old-pin.ts']);
		assert.strictEqual(b.isSticky(b.editors[0]), false);
		assert.strictEqual(b.isSticky(b.editors[1]), true);
		assert.deepStrictEqual(services.opened, [{ name: 'pinned.ts', groupId: 1, sticky: true, inactive: true, preserveFocus: true }]);
		assert.deepStrictEqual(services.applications, [{ workingSet: 'branch-b', preserveFocus: true }]);
	});

	test('restores a pinned tab when switching to a new empty working set and the original group is gone', async () => {
		const a = testGroup(1, [['pinned.ts', true], ['a.ts', false]]);
		const b = testGroup(2, []);
		const services = testServices([a], [b]);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, 'empty', false, true);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['pinned.ts']);
		assert.strictEqual(b.isSticky(b.editors[0]), true);
		assert.deepStrictEqual(services.applications, [{ workingSet: 'empty', preserveFocus: false }]);
	});

	test('pins an already-restored editor without opening a duplicate or changing unrelated tabs', async () => {
		const a = testGroup(1, [['pinned.ts', true]]);
		const b = testGroup(1, [['pinned.ts', false], ['b.ts', false]]);
		const services = testServices([a], [b]);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'b', name: 'b' }, true, true);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['pinned.ts', 'b.ts']);
		assert.strictEqual(b.isSticky(b.editors[0]), true);
		assert.strictEqual(b.isSticky(b.editors[1]), false);
		assert.strictEqual(services.opened.length, 0);
	});

	test('does not resurrect pinned tabs that were closed or unpinned on the previous branch', async () => {
		const a = testGroup(1, [['un-pinned.ts', false]]);
		const b = testGroup(1, [['un-pinned.ts', true], ['closed.ts', true], ['branch-b.ts', false]]);
		const services = testServices([a], [b]);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'b', name: 'b' }, false, true);
		assert.deepStrictEqual(b.closed, ['un-pinned.ts', 'closed.ts']);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['branch-b.ts']);
	});

	test('leaves existing working-set behavior unchanged when persistPins is disabled', async () => {
		const a = testGroup(1, [['a-pin.ts', true]]);
		const b = testGroup(1, [['b-pin.ts', true], ['b.ts', false]]);
		const services = testServices([a], [b]);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'b', name: 'b' }, true, false);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['b-pin.ts', 'b.ts']);
		assert.deepStrictEqual(b.closed, []);
		assert.deepStrictEqual(services.opened, []);
	});

	test('does not touch editor tabs if working-set application fails', async () => {
		const a = testGroup(1, [['a-pin.ts', true]]);
		const b = testGroup(1, [['b-pin.ts', true]]);
		const services = testServices([a], [b], false);
		assert.strictEqual(await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'b', name: 'b' }, true, true), false);
		assert.deepStrictEqual(a.closed, []);
		assert.deepStrictEqual(b.closed, []);
		assert.strictEqual(services.opened.length, 0);
	});

	test('honors a close veto from a dirty editor in the restored working set', async () => {
		const a = testGroup(1, []);
		const b = testGroup(1, [['dirty-pin.ts', true]]);
		b.vetoClose = true;
		const services = testServices([a], [b]);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, { id: 'b', name: 'b' }, false, true);
		assert.deepStrictEqual(b.editors.map(editor => (editor as ITestEditor).testId), ['dirty-pin.ts']);
	});

	test('reuses an untyped-unsupported editor if its input survived the switch', async () => {
		const input = testEditor('custom-editor', false);
		const a = testGroup(1, []);
		a.editors.push(input);
		a.sticky.add('custom-editor');
		const b = testGroup(2, []);
		const services = testServices([a], [b], true, false);
		await applyWorkingSetWithPinnedEditors(services.editorGroupsService, services.editorService, 'empty', true, true);
		assert.deepStrictEqual(b.opened, ['custom-editor']);
		assert.strictEqual(b.isSticky(input), true);
	});
});
