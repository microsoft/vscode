/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatManagementEditor.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { MODEL_ROUTERS_EDITOR_ID } from '../../common/constants.js';
import { ModelRoutersWidget } from './modelRoutersWidget.js';

const $ = DOM.$;

/** Shows the model routers, in the frame of the Language Models editor it opens beside. */
export class ModelRoutersEditor extends EditorPane {

	static readonly ID: string = MODEL_ROUTERS_EDITOR_ID;

	private bodyContainer: HTMLElement | undefined;
	private widget: ModelRoutersWidget | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super(ModelRoutersEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.bodyContainer = DOM.append(parent, $('.ai-models-management-editor'));
		this.widget = this._register(this.instantiationService.createInstance(ModelRoutersWidget, { beforeNavigate: () => this.closeModal() }));
		this.bodyContainer.appendChild(this.widget.element);
	}

	/** Closes the modal that shows the editor, which would cover what the routers open next. False when it stays open. */
	private async closeModal(): Promise<boolean> {
		const modalEditorPart = this.editorGroupsService.activeModalEditorPart;
		return modalEditorPart?.groups.some(group => group.id === this.group.id) ? modalEditorPart.close() : true;
	}

	override layout(dimension: Dimension): void {
		if (this.bodyContainer) {
			this.widget?.layout(dimension.height - 15, this.bodyContainer.clientWidth - 24);
		}
	}

	override focus(): void {
		super.focus();
		this.widget?.focus();
	}

	/** The routers the editor lists, as text for the accessible view. None while the form for a router shows in their place. */
	getAccessibilityContent(): string | undefined {
		return this.widget?.isShowingForm ? undefined : this.widget?.getAccessibilityContent();
	}

	/** Whether the form for a router is showing in place of the routers. */
	get isShowingForm(): boolean {
		return !!this.widget?.isShowingForm;
	}
}
