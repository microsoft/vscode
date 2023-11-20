/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';
import { IResourceLabel, IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ICompositeControl } from 'vs/workbench/common/composite';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';

export class MultiDiffEditor extends EditorPane {
	static readonly ID = 'multiDiffEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {
		super(MultiDiffEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			parent,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));
	}

	override async setInput(input: MultiDiffEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!input.viewModel) {
			const vm = await input.getModel();
			input.viewModel = this._multiDiffEditorWidget!.createViewModel(vm);
		}
		this._multiDiffEditorWidget!.setViewModel(input.viewModel);
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._multiDiffEditorWidget!.setViewModel(undefined);
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}
}

class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri) {
				label.element.setFile(uri, {});
			},
			dispose() {
				label.dispose();
			}
		};
	}
}
