/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorInputFactory, EditorInput, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, EditorModel, EditorOptions, GroupIdentifier, ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
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
import { editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IWorkingCopy, IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { env } from 'vs/base/common/process';

const CUSTOM_SCHEME = 'testCustomEditor';
const ENABLE = !!env['VSCODE_DEV'];

class TestCustomEditorsAction extends Action {

	static readonly ID = 'workbench.action.openCustomEditor';
	static readonly LABEL = nls.localize('openCustomEditor', "Test Open Custom Editor");

	constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	async run(): Promise<boolean> {
		const input = this.instantiationService.createInstance(TestCustomEditorInput, URI.parse(`${CUSTOM_SCHEME}:/${generateUuid()}`));
		await this.editorService.openEditor(input);

		return true;
	}
}

class TestCustomEditor extends BaseEditor {

	static ID = 'testCustomEditor';

	private textArea: HTMLTextAreaElement | undefined = undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(TestCustomEditor.ID, telemetryService, themeService, storageService);
	}

	updateStyles(): void {
		super.updateStyles();

		if (this.textArea) {
			this.textArea.style.backgroundColor = this.getColor(editorBackground)!.toString();
			this.textArea.style.color = this.getColor(editorForeground)!.toString();
		}
	}

	protected createEditor(parent: HTMLElement): void {
		this.textArea = document.createElement('textarea');
		this.textArea.style.width = '100%';
		this.textArea.style.height = '100%';

		parent.appendChild(this.textArea);

		addDisposableListener(this.textArea, EventType.CHANGE, e => this.onDidType());
		addDisposableListener(this.textArea, EventType.KEY_UP, e => this.onDidType());

		this.updateStyles();
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

class TestCustomEditorInput extends EditorInput implements IWorkingCopy {
	private model: TestCustomEditorModel | undefined = undefined;

	private dirty = false;

	readonly capabilities = 0;

	constructor(public readonly resource: URI, @IWorkingCopyService workingCopyService: IWorkingCopyService) {
		super();

		this._register(workingCopyService.registerWorkingCopy(this));
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return TestCustomEditor.ID;
	}

	getName(): string {
		return this.resource.toString();
	}

	setValue(value: string) {
		if (this.model) {
			if (this.model.value === value) {
				return;
			}

			this.model.value = value;
		}

		this.setDirty(value.length > 0);
	}

	private setDirty(dirty: boolean) {
		if (this.dirty !== dirty) {
			this.dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	isReadonly(): boolean {
		return false;
	}

	isDirty(): boolean {
		return this.dirty;
	}

	async save(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		this.setDirty(false);

		return true;
	}

	async saveAs(groupId: GroupIdentifier, options?: ISaveOptions): Promise<boolean> {
		this.setDirty(false);

		return true;
	}

	async revert(options?: IRevertOptions): Promise<boolean> {
		this.setDirty(false);

		return true;
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

	dispose(): void {
		this.setDirty(false);

		if (this.model) {
			this.model.dispose();
			this.model = undefined;
		}

		super.dispose();
	}
}

class TestCustomEditorModel extends EditorModel {

	public value: string = '';

	constructor(public readonly resource: URI) {
		super();
	}
}

if (ENABLE) {
	Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
		EditorDescriptor.create(
			TestCustomEditor,
			TestCustomEditor.ID,
			nls.localize('testCustomEditor', "Test Custom Editor")
		),
		[
			new SyncDescriptor<EditorInput>(TestCustomEditorInput),
		]
	);

	const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

	registry.registerWorkbenchAction(SyncActionDescriptor.create(TestCustomEditorsAction, TestCustomEditorsAction.ID, TestCustomEditorsAction.LABEL), 'Test Open Custom Editor');

	class TestCustomEditorInputFactory implements IEditorInputFactory {

		serialize(editorInput: TestCustomEditorInput): string {
			return JSON.stringify({
				resource: editorInput.resource.toString()
			});
		}

		deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TestCustomEditorInput {
			return instantiationService.createInstance(TestCustomEditorInput, URI.parse(JSON.parse(serializedEditorInput).resource));
		}
	}

	Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(TestCustomEditor.ID, TestCustomEditorInputFactory);
}
