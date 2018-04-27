/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorGroupView';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions, GroupIdentifier } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, addClasses, Dimension } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorBackground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { Themable, EDITOR_GROUP_HEADER_TABS_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND } from 'vs/workbench/common/theme';
import { INextEditor, INextEditorGroup } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { INextTitleAreaControl } from 'vs/workbench/browser/parts/editor2/nextTitleControl';
import { NextTabsTitleControl } from 'vs/workbench/browser/parts/editor2/nextTabsTitleControl';
import { NextEditorControl } from 'vs/workbench/browser/parts/editor2/nextEditorControl';
import { IView } from 'vs/base/browser/ui/grid/gridview';

export class NextEditorGroupView extends Themable implements IView, INextEditorGroup {

	private static readonly EDITOR_TITLE_HEIGHT = 35;

	private group: EditorGroup;

	private dimension: Dimension;

	private container: HTMLElement;

	private titleContainer: HTMLElement;
	private titleAreaControl: INextTitleAreaControl;

	private editorContainer: HTMLElement;
	private editorControl: NextEditorControl;

	private progressBar: ProgressBar;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.group = this._register(instantiationService.createInstance(EditorGroup, ''));
		this.group.label = `Group <${this.group.id}>`;
	}

	//#region INextEditorGroup Implementation

	get id(): GroupIdentifier {
		return this.group.id;
	}

	openEditor(input: EditorInput, options?: EditorOptions): INextEditor {

		// Update model
		this.group.openEditor(input, options);

		// Update title control
		// TODO@grid also, wouldn't it be better if the title widget would register as listener to changes to the group and just
		// refresh itself instead of having to do this from the outside?
		// See editorGroupsControl#handleStacksChanged() as example for how this is done currently
		this.doCreateOrGetTitleControl().refresh(true);

		// Forward to editor control
		return this.doCreateOrGetEditorControl().openEditor(input, options);
	}

	private doCreateOrGetTitleControl(): INextTitleAreaControl {
		if (!this.titleAreaControl) {
			const containerInstantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this._register(this.contextKeyService.createScoped(this.container))] // Scoped instantiation service for a scoped context key service
			));

			this.titleAreaControl = this._register(containerInstantiationService.createInstance(NextTabsTitleControl, this.titleContainer, this.group));
			this.doLayoutTitleControl();
		}

		return this.titleAreaControl;
	}

	private doCreateOrGetEditorControl(): NextEditorControl {
		if (!this.editorControl) {
			this.editorControl = this._register(this.instantiationService.createInstance(NextEditorControl, this.editorContainer, this.group));
			this.doLayoutEditorControl();
		}

		return this.editorControl;
	}

	//#endregion

	//#region Themable Implementation

	protected updateStyles(): void {
		super.updateStyles();

		// Title control
		const borderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER) || this.getColor(contrastBorder);
		this.titleContainer.style.backgroundColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
		this.titleContainer.style.borderBottomWidth = borderColor ? '1px' : null;
		this.titleContainer.style.borderBottomStyle = borderColor ? 'solid' : null;
		this.titleContainer.style.borderBottomColor = borderColor;

		// Editor background
		this.container.style.backgroundColor = this.getColor(editorBackground);
	}

	//#endregion

	//#region IView implementation

	readonly minimumWidth = 150;
	readonly maximumWidth = 150;
	readonly minimumHeight = Number.POSITIVE_INFINITY;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	get onDidChange() { return Event.None; }

	render(container: HTMLElement): void {

		// Overall container
		this.container = document.createElement('div');
		addClass(this.container, 'editor-group-container');
		container.appendChild(this.container);

		// Title container
		this.titleContainer = document.createElement('div');
		addClasses(this.titleContainer, 'title', 'tabs', 'show-file-icons', 'active');
		this.container.appendChild(this.titleContainer);

		// Progress bar
		this.progressBar = new ProgressBar(this.container);
		this._register(attachProgressBarStyler(this.progressBar, this.themeService));
		this.progressBar.hide();

		// Editor container
		this.editorContainer = document.createElement('div');
		addClass(this.editorContainer, 'editor-container');
		this.editorContainer.setAttribute('role', 'tabpanel');
		this.container.appendChild(this.editorContainer);

		// Update styles
		this.updateStyles();
	}

	layout(width: number, height: number): void {
		this.dimension = new Dimension(width, height); // TODO@grid need full dimension here

		// Layout title control if present
		if (this.titleAreaControl) {
			this.doLayoutTitleControl();
		}

		// Layout editor control if present
		if (this.editorControl) {
			this.doLayoutEditorControl();
		}
	}

	private doLayoutTitleControl(): void {
		this.titleAreaControl.layout(new Dimension(this.dimension.width, NextEditorGroupView.EDITOR_TITLE_HEIGHT));
	}

	private doLayoutEditorControl(): void {
		this.editorControl.layout(new Dimension(this.dimension.width, 150 /* TODO@grid need full dimension here */ - NextEditorGroupView.EDITOR_TITLE_HEIGHT));
	}

	//#endregion
}