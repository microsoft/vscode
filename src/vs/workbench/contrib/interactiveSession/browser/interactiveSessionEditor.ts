/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { Memento } from 'vs/workbench/common/memento';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { IViewState, InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { IInteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';

export interface IInteractiveSessionEditorOptions extends IEditorOptions {
	providerId: string;
}

export class InteractiveSessionEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactiveSession';

	private widget!: InteractiveSessionWidget;

	private _scopedContextKeyService!: IScopedContextKeyService;
	override get scopedContextKeyService() {
		return this._scopedContextKeyService;
	}

	private _memento: Memento | undefined;
	private _viewState: IViewState | undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
	) {
		super(InteractiveSessionEditor.ID, telemetryService, themeService, storageService);
	}

	public async clear() {
		if (this.widget?.viewModel) {
			this.interactiveSessionService.clearSession(this.widget.viewModel.sessionId);
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(parent));
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

		this.widget = this._register(
			scopedInstantiationService.createInstance(InteractiveSessionWidget, { resource: true }, () => editorBackground, () => SIDE_BAR_BACKGROUND, () => SIDE_BAR_BACKGROUND));
		this.widget.render(parent);
		this.widget.setVisible(true);
	}

	public override focus(): void {
		if (this.widget) {
			this.widget.focusInput();
		}
	}

	override clearInput(): void {
		this.saveState();
		super.clearInput();
	}

	override async setInput(input: InteractiveSessionEditorInput, options: IInteractiveSessionEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);

		const editorModel = await input.resolve();
		if (!editorModel) {
			throw new Error(`Failed to get model for interactive session editor. id: ${input.sessionId}`);
		}

		if (!this.widget) {
			throw new Error('InteractiveSessionEditor lifecycle issue: no editor widget');
		}

		this.updateModel(editorModel.model, options);
	}

	private updateModel(model: IInteractiveSessionModel, options: IInteractiveSessionEditorOptions): void {
		this._memento = new Memento('interactive-session-editor-' + model.sessionId, this.storageService);
		this._viewState = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.USER) as IViewState;
		this.widget.setModel(model, { ...this._viewState });
		const listener = model.onDidDispose(() => {
			// TODO go back to swapping out the EditorInput when the session is restarted instead of this listener
			listener.dispose();
			const newModel = this.interactiveSessionService.startSession(options.providerId, false, CancellationToken.None);
			if (newModel) {
				(this.input as InteractiveSessionEditorInput).sessionId = newModel.sessionId;
				this.updateModel(newModel, options);
			}
		});
	}

	protected override saveState(): void {
		this.widget?.saveState();

		if (this._memento && this._viewState) {
			const widgetViewState = this.widget.getViewState();
			this._viewState!.inputValue = widgetViewState.inputValue;
			this._memento!.saveMemento();
		}
	}

	override layout(dimension: dom.Dimension, position?: dom.IDomPosition | undefined): void {
		if (this.widget) {
			const width = Math.min(dimension.width, 600);
			this.widget.layout(dimension.height, width);
		}
	}
}

