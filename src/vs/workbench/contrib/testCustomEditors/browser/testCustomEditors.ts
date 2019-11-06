/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorInputFactory, EditorInput, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, EditorModel, ConfirmResult, IRevertOptions, EditorOptions } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { Dimension, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { isEqual } from 'vs/base/common/resources';
import { generateUuid } from 'vs/base/common/uuid';
import { CancellationToken } from 'vs/base/common/cancellation';

export class TestCustomEditorsAction extends Action {

	static readonly ID = 'workbench.action.openCustomEditor';
	static readonly LABEL = nls.localize('openCustomEditor', "Test Open Custom Editor");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		await this.editorService.openEditor(new TestCustomEditorInput(URI.parse(`testCustomEditor:/${generateUuid()}`)));

		return true;
	}
}

export class TestCustomEditor extends BaseEditor {

	static ID = 'testCustomEditor';

	private textArea: HTMLTextAreaElement | undefined = undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(TestCustomEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.textArea = document.createElement('textarea');
		this.textArea.style.width = '100%';
		this.textArea.style.height = '100%';
		parent.appendChild(this.textArea);

		addDisposableListener(this.textArea, EventType.CHANGE, e => this.onDidType());
		addDisposableListener(this.textArea, EventType.KEY_UP, e => this.onDidType());
	}

	private onDidType(): void {
		if (this._input instanceof TestCustomEditorInput) {
			this._input.setValue(this.textArea!.value);
		}
	}

	async setInput(input: EditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, token);

		const model = await input.resolve();
		if (model instanceof TestCustomEditorModel) {
			this.textArea!.value = model.value;
		}
	}

	clearInput() {
		super.clearInput();

		this.textArea!.value = '';
	}

	focus(): void {
		this.textArea!.focus();
	}

	layout(dimension: Dimension): void { }
}

export class TestCustomEditorInput extends EditorInput {
	private model: TestCustomEditorModel | undefined = undefined;
	private dirty = false;

	constructor(public readonly resource: URI) {
		super();
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return TestCustomEditor.ID;
	}

	getName(): string {
		return `Custom Editor: ${this.resource.toString()}`;
	}

	setValue(value: string) {
		if (this.model) {
			this.model.value = value;
		}

		this.setDirty(true);
	}

	setDirty(dirty: boolean) {
		this.dirty = dirty;
		this._onDidChangeDirty.fire();
	}

	isDirty(): boolean {
		return this.dirty;
	}

	confirmSave(): Promise<ConfirmResult> {
		// TODO
		return Promise.resolve(ConfirmResult.DONT_SAVE);
	}

	save(): Promise<boolean> {
		this.setDirty(false);

		return Promise.resolve(true);
	}

	revert(options?: IRevertOptions): Promise<boolean> {
		this.setDirty(false);

		return Promise.resolve(true);
	}

	async resolve(): Promise<IEditorModel | null> {
		if (!this.model) {
			this.model = new TestCustomEditorModel(this.resource);
		}

		return this.model;
	}

	matches(other: EditorInput) {
		return other instanceof TestCustomEditorInput && isEqual(other.resource, this.resource);
	}
}

export class TestCustomEditorModel extends EditorModel {

	public value: string = '';

	constructor(public readonly resource: URI) {
		super();
	}
}

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TestCustomEditor,
		TestCustomEditor.ID,
		nls.localize('testCustomEditor', "Test Custom Editor")
	),
	[
		new SyncDescriptor<EditorInput>(TestCustomEditorInput),
	]
);

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(TestCustomEditorsAction, TestCustomEditorsAction.ID, TestCustomEditorsAction.LABEL), 'Test Open Custom Editor');

class TestCustomEditorInputFactory implements IEditorInputFactory {

	serialize(editorInput: TestCustomEditorInput): string {
		return JSON.stringify({
			resource: editorInput.resource.toString()
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TestCustomEditorInput {
		return new TestCustomEditorInput(URI.parse(JSON.parse(serializedEditorInput).resource));
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(TestCustomEditor.ID, TestCustomEditorInputFactory);
