/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInput } from '../../../workbench/common/editor/editorInput.js';
import { DiffEditorInput } from '../../../workbench/common/editor/diffEditorInput.js';
import { IEditorService } from '../../../workbench/services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AuxiliaryBarPart } from '../../browser/parts/auxiliaryBarPart.js';

const MULTI_DIFF_EDITOR_INPUT_ID = 'workbench.input.multiDiffEditor';

class MutableTestLayoutService extends TestLayoutService {

	private readonly _visibleParts = new Map<Parts, boolean>([
		[Parts.AUXILIARYBAR_PART, true],
		[Parts.EDITOR_PART, false],
	]);

	private readonly _onDidChangePartVisibility = new Emitter<IPartVisibilityChangeEvent>();
	override readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	override isVisible(part: Parts, _targetWindow?: Window): boolean {
		return this._visibleParts.get(part) ?? false;
	}

	setVisible(part: Parts, visible: boolean): void {
		this._visibleParts.set(part, visible);
		this._onDidChangePartVisibility.fire({ partId: part, visible });
	}

	dispose(): void {
		this._onDidChangePartVisibility.dispose();
	}
}

class MutableTestEditorService implements Partial<IEditorService> {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidVisibleEditorsChange = new Emitter<void>();
	readonly onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;
	readonly onDidActiveEditorChange = Event.None;
	readonly onDidEditorsChange = Event.None;
	readonly onWillOpenEditor = Event.None;
	readonly onDidCloseEditor = Event.None;
	readonly visibleEditorPanes = [];
	readonly visibleTextEditorControls = [];
	visibleEditors: readonly EditorInput[] = [];

	setVisibleEditors(editors: readonly EditorInput[]): void {
		this.visibleEditors = editors;
		this._onDidVisibleEditorsChange.fire();
	}

	dispose(): void {
		this._onDidVisibleEditorsChange.dispose();
	}
}

function createEditorInput(typeId: string, editorId?: string): EditorInput {
	return { typeId, editorId } as EditorInput;
}

suite('Sessions - Auxiliary Bar Part', () => {
	const disposables = new DisposableStore();

	let instantiationService: TestInstantiationService;
	let layoutService: MutableTestLayoutService;
	let editorService: MutableTestEditorService;
	let auxiliaryBarPart: AuxiliaryBarPart;

	setup(() => {
		layoutService = new MutableTestLayoutService();
		editorService = new MutableTestEditorService();
		instantiationService = workbenchInstantiationService({
			editorService: () => editorService as unknown as IEditorService
		}, disposables);
		instantiationService.stub(IWorkbenchLayoutService, layoutService as IWorkbenchLayoutService);
		auxiliaryBarPart = disposables.add(instantiationService.createInstance(AuxiliaryBarPart));
	});

	teardown(() => {
		layoutService.dispose();
		editorService.dispose();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the default minimum width and disables sash snap for diff editors', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);
		editorService.setVisibleEditors([createEditorInput(DiffEditorInput.ID)]);

		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, false);
	});

	test('keeps the default minimum width and disables sash snap for integrated browser editors', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);
		editorService.setVisibleEditors([createEditorInput('workbench.input.webview', 'mainThreadWebview-simpleBrowser.view')]);

		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, false);
	});

	test('keeps the default minimum width and disables sash snap for localhost link browser editors', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);
		editorService.setVisibleEditors([createEditorInput('workbench.editorinputs.browser', 'workbench.editor.browser')]);

		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, false);
	});

	test('restores the default auxiliary bar constraints for other editor states', () => {
		layoutService.setVisible(Parts.EDITOR_PART, true);
		editorService.setVisibleEditors([createEditorInput(MULTI_DIFF_EDITOR_INPUT_ID)]);
		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, false);

		editorService.setVisibleEditors([createEditorInput('workbench.editors.textEditorInput')]);

		assert.strictEqual(auxiliaryBarPart.minimumWidth, 270);
		assert.strictEqual(auxiliaryBarPart.snap, true);
	});
});
