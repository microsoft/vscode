/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MutableDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';

export interface IInteractiveSessionEditorOptions extends IEditorOptions {
	providerId: string;
}

export class InteractiveSessionEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactiveSession';

	private widget = new MutableDisposable<InteractiveSessionWidget>();
	private parentElement: HTMLElement | undefined;
	private dimension: dom.Dimension | undefined;

	private readonly _scopedContextKeyService = this._register(new MutableDisposable<IScopedContextKeyService>());
	override get scopedContextKeyService() {
		return this._scopedContextKeyService.value;
	}

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(InteractiveSessionEditor.ID, telemetryService, themeService, storageService);
	}

	public async clear() {
		if (this.widget.value) {
			await this.widget.value.clear();
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this.parentElement = parent;
	}

	public override focus(): void {
		if (this.widget.value) {
			this.widget.value.focusInput();
		}
	}

	override clearInput(): void {
		super.clearInput();

		// This will dispose the current widget and release its session
		this.widget.clear();

		dom.clearNode(this.parentElement!);
	}

	override async setInput(input: InteractiveSessionEditorInput, options: IInteractiveSessionEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);

		// This will dispose the current widget and release its session
		this.widget.clear();

		const editorModel = await input.resolve();
		if (!editorModel) {
			throw new Error('Failed to get model for interactive session editor');
		}

		if (!this.parentElement) {
			throw new Error('InteractiveSessionEditor lifecycle issue: Parent element not set');
		}

		this._scopedContextKeyService.value = this._register(this.contextKeyService.createScoped(this.parentElement));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
		this.widget.value = scopedInstantiationService.createInstance(InteractiveSessionWidget, editorModel.model.providerId, editorModel.model, { resource: input.resource }, () => editorBackground, () => SIDE_BAR_BACKGROUND, () => SIDE_BAR_BACKGROUND);
		this.widget.value.render(this.parentElement);
		this.widget.value.setVisible(true);

		if (this.dimension) {
			this.layout(this.dimension, undefined);
		}
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		if (this.widget.value) {
			const width = Math.min(dimension.width, 600);
			this.widget.value.layout(dimension.height, width);
		}

		this.dimension = dimension;
	}
}

