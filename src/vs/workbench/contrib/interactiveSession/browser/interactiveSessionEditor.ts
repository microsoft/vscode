/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
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
import { Memento } from 'vs/workbench/common/memento';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';

export interface IInteractiveSessionEditorOptions extends IEditorOptions {
	providerId: string;
}

export class InteractiveSessionEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactiveSession';

	private widget: InteractiveSessionWidget | undefined;
	private widgetDisposables = this._register(new DisposableStore());

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
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(InteractiveSessionEditor.ID, telemetryService, themeService, storageService);
	}

	public async clear() {
		if (this.widget) {
			await this.widget.clear();
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this.parentElement = parent;
	}

	public override focus(): void {
		if (this.widget) {
			this.widget.focusInput();
		}
	}

	override async setInput(input: InteractiveSessionEditorInput, options: IInteractiveSessionEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);

		this.widgetDisposables.clear();

		const editorModel = await input.resolve();
		if (!editorModel) {
			throw new Error(`Failed to get model for interactive session editor. id: ${input.sessionId}`);
		}

		if (!this.parentElement) {
			throw new Error('InteractiveSessionEditor lifecycle issue: Parent element not set');
		}

		this._scopedContextKeyService.value = this._register(this.contextKeyService.createScoped(this.parentElement));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

		if (this.widget) {
			dom.clearNode(this.parentElement);
		}

		const memento = new Memento(input.resource.path, this.storageService);
		this.widget = this.widgetDisposables.add(
			scopedInstantiationService.createInstance(InteractiveSessionWidget, editorModel.model.providerId, editorModel.model, { resource: input.resource }, () => editorBackground, () => SIDE_BAR_BACKGROUND, () => SIDE_BAR_BACKGROUND, memento));
		this.widget.render(this.parentElement);
		this.widget.setVisible(true);

		this.widgetDisposables.add(this.widget.onDidChangeViewModel(() => {
			// This part is a bit odd. The widget's session and model will change. When that happens, store the latest session id
			// on the EditorInput so that it can be restored when the editor moves or the window reloads.
			input.sessionId = this.widget!.viewModel?.sessionId;
		}));

		if (this.dimension) {
			this.layout(this.dimension, undefined);
		}
	}

	protected override saveState(): void {
		this.widget?.saveState();
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		if (this.widget) {
			const width = Math.min(dimension.width, 600);
			this.widget.layout(dimension.height, width);
		}

		this.dimension = dimension;
	}
}

