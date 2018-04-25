/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorGroupView';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions, GroupIdentifier } from 'vs/workbench/common/editor';
import { IView } from 'vs/base/browser/ui/splitview/splitview';
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

export class NextEditorGroupView extends Themable implements IView, INextEditorGroup {

	private static readonly EDITOR_TITLE_HEIGHT = 35;

	readonly minimumSize: number = 200;
	readonly maximumSize: number = Number.MAX_VALUE;

	private _onDidChange: Event<number | undefined> = Event.None;
	get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	private group: EditorGroup;

	private dimension: Dimension;

	private container: HTMLElement;

	private titleContainer: HTMLElement;
	private titleAreaControl: INextTitleAreaControl;

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
		this.doCreateOrGetTitleArea().refresh();

		return Object.create(null);
	}

	private doCreateOrGetTitleArea(): INextTitleAreaControl {
		if (!this.titleAreaControl) {

			// Scoped instantiation service for a scoped context key service
			const containerInstantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this._register(this.contextKeyService.createScoped(this.container))]
			));

			// TODO@grid if editor group is always bound to same context, simplify usage by passing over title container and group via ctor?
			this.titleAreaControl = this._register(containerInstantiationService.createInstance<INextTitleAreaControl>(NextTabsTitleControl)); // TODO@grid title control choice (tabs vs no tabs)
			this.titleAreaControl.create(this.titleContainer);
			this.titleAreaControl.setContext(this.group);
			this.titleAreaControl.refresh(true /* instant */);

			this.updateStyles();
		}

		return this.titleAreaControl;
	}

	//#endregion

	//#region Themable Implementation

	protected updateStyles(): void {
		super.updateStyles();

		// Title control (TODO@grid respect tab options)
		if (this.titleAreaControl) {
			const titleContainer = this.titleAreaControl.getContainer();
			const borderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER) || this.getColor(contrastBorder);

			titleContainer.style.backgroundColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
			titleContainer.style.borderBottomWidth = borderColor ? '1px' : null;
			titleContainer.style.borderBottomStyle = borderColor ? 'solid' : null;
			titleContainer.style.borderBottomColor = borderColor;
		}

		// Editor background
		this.container.style.backgroundColor = this.getColor(editorBackground);
	}

	//#endregion

	//#region IView implementation

	render(container: HTMLElement): void {

		// Overall container
		this.container = document.createElement('div');
		addClass(this.container, 'editor-group-container');
		container.appendChild(this.container);

		// Title container
		this.titleContainer = document.createElement('div');
		addClasses(this.titleContainer, 'title', 'tabs', 'show-file-icons', 'active'); // TODO@grid title options (tabs, icons, etc...)
		this.container.appendChild(this.titleContainer);

		// Progress bar
		this.progressBar = new ProgressBar(this.container);
		this._register(attachProgressBarStyler(this.progressBar, this.themeService));
		this.progressBar.hide();

		// Editor container
		const editorContainer = document.createElement('div');
		addClass(editorContainer, 'editor-container');
		editorContainer.setAttribute('role', 'tabpanel');
		this.container.appendChild(editorContainer);

		// Update styles
		this.updateStyles();
	}

	layout(size: number): void {
		this.dimension = new Dimension(size, -1); // TODO@grid need full dimension here

		// Layout title if present
		if (this.titleAreaControl) {
			this.titleAreaControl.layout(new Dimension(this.dimension.width, NextEditorGroupView.EDITOR_TITLE_HEIGHT));
		}
	}

	//#endregion
}