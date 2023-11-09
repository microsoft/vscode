/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { MultiDiffEditorInput } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput';
import { MultiDiffEditorWidget } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';
import { toDisposable } from 'vs/base/common/lifecycle';
import { ConstLazyPromise, IDiffEntry } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';

export class MultiDiffEditor extends EditorPane {
	static readonly ID = 'multiDiffEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(MultiDiffEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(MultiDiffEditorWidget, parent));
	}

	override async setInput(input: MultiDiffEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		const rs = await Promise.all(input.resources.map(async r => ({
			originalRef: await this.textModelService.createModelReference(r.original!),
			modifiedRef: await this.textModelService.createModelReference(r.modified!),
			title: r.resource.fsPath,
		})));

		this._multiDiffEditorWidget?.setModel({
			onDidChange: () => toDisposable(() => { }),
			diffs: rs.map(r => new ConstLazyPromise<IDiffEntry>({
				original: r.originalRef.object.textEditorModel,
				modified: r.modifiedRef.object.textEditorModel,
				title: r.title,
			})),
		});
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget?.layout(dimension);
	}
}
