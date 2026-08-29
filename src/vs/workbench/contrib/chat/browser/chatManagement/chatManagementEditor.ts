/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatManagementEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ModelsManagementEditorInput } from './chatManagementEditorInput.js';
import { ChatModelsWidget } from './chatModelsWidget.js';
import { CONTEXT_MODELS_EDITOR } from '../../common/constants.js';

const $ = DOM.$;

export class ModelsManagementEditor extends EditorPane {

	static readonly ID: string = 'workbench.editor.modelsManagement';

	private readonly editorDisposables = this._register(new DisposableStore());
	private dimension: Dimension | undefined;
	private modelsWidget: ChatModelsWidget | undefined;
	private bodyContainer: HTMLElement | undefined;

	private readonly inModelsEditorContextKey: IContextKey<boolean>;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(ModelsManagementEditor.ID, group, telemetryService, themeService, storageService);
		this.inModelsEditorContextKey = CONTEXT_MODELS_EDITOR.bindTo(contextKeyService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.editorDisposables.clear();
		this.bodyContainer = DOM.append(parent, $('.ai-models-management-editor'));
		this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
		this.bodyContainer.appendChild(this.modelsWidget.element);
	}

	override async setInput(input: ModelsManagementEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.inModelsEditorContextKey.set(true);
		await super.setInput(input, options, context, token);
		if (this.dimension) {
			this.layout(this.dimension);
		}
		this.modelsWidget?.render();
	}

	override layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.bodyContainer) {
			this.modelsWidget?.layout(dimension.height - 15, this.bodyContainer!.clientWidth - 24);
		}
	}

	override focus(): void {
		super.focus();
		this.modelsWidget?.focusSearch();
	}

	override clearInput(): void {
		this.inModelsEditorContextKey.set(false);
		super.clearInput();
	}

	clearSearch(): void {
		this.modelsWidget?.clearSearch();
	}

	search(query: string): void {
		this.modelsWidget?.search(query);
	}
}
