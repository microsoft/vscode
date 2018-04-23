/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorGroupView';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { IView, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, addClasses, Dimension } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITitleAreaControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { TabsTitleControl } from 'vs/workbench/browser/parts/editor/tabsTitleControl';

export class NextEditorGroupView extends Disposable implements IView {

	private static readonly EDITOR_TITLE_HEIGHT = 35;

	readonly minimumSize: number = 200;
	readonly maximumSize: number = Number.MAX_VALUE;

	private _onDidChange: Event<number | undefined> = Event.None;
	get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	private _group: EditorGroup;

	private _element: HTMLElement;
	private container: HTMLElement;

	private titleAreaControl: ITitleAreaControl;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super();

		this._group = this._register(instantiationService.createInstance(EditorGroup, 'Editor Group')); // TODO@grid group label?

		this.create();
	}

	get element(): HTMLElement {
		return this._element;
	}

	get group(): EditorGroup {
		return this._group;
	}

	private create(): void {

		// TODO@grid simplify containers by flattening the hierarchy more?

		// Overall Container
		this._element = document.createElement('div');
		addClass(this._element, 'one-editor-silo');

		// Title / Progress / Editor Container
		this.container = document.createElement('div');
		addClass(this.container, 'container');
		this._element.appendChild(this.container);

		// Scoped Instantiation Service
		const instantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._register(this.contextKeyService.createScoped(this.container))]
		));

		// Title Container
		const titleContainer = document.createElement('div');
		addClasses(titleContainer, 'title', 'tabs', 'show-file-icons'); // TODO@grid title options (tabs, icons)
		this.container.appendChild(titleContainer);

		// Title Widget
		this.titleAreaControl = this._register(instantiationService.createInstance<ITitleAreaControl>(TabsTitleControl)); // TODO@grid title control choice (tabs vs no tabs)
		this.titleAreaControl.create(titleContainer);
		this.titleAreaControl.setContext(this._group);
		this.titleAreaControl.refresh(true /* instant */);

		// TODO@grid progress bar
		// TODO@grid editors container
	}

	openEditor(input: EditorInput, options?: EditorOptions): void {
		this._group.openEditor(input, options);

		this.render(this.container, Orientation.HORIZONTAL);
	}

	render(container: HTMLElement, orientation: Orientation): void {
		this.titleAreaControl.refresh(true /* instant */);
	}

	layout(size: number, orientation: Orientation): void {
		this.titleAreaControl.layout(new Dimension(size, NextEditorGroupView.EDITOR_TITLE_HEIGHT));
	}
}