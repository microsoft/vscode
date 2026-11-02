/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IPartGridPartFactory } from '../../../browser/parts/partGrid/partGrid.js';
import { IAuxiliaryWindow } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../../services/editor/browser/editorPartWindowBinding.js';
import { IContentPart, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IChatWindowLook } from './chatWindow.js';

/**
 * Creates the parts a chat window's part grid adds, such as for an editor
 * dropped on an edge of the window: like the window's main part, with the
 * window's services and look, and closed with the window.
 */
export class ChatWindowPartFactory extends Disposable implements IPartGridPartFactory {

	private counter = 0;
	private readonly parts = this._register(new DisposableMap<IContentPart>());

	constructor(
		private readonly window: IAuxiliaryWindow,
		private readonly services: ServiceCollection,
		private readonly look: IChatWindowLook,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();
	}

	createPart(): { readonly id: string; readonly part: IContentPart } {
		const id = `chatWindow.part.${++this.counter}`;

		// The part belongs to the window its element is in: the grid then takes the element to its cell
		const container = append(this.window.container, $('.chat-window-part'));
		const part = this.editorGroupsService.createEditorPart({
			container,
			label: localize('chatWindow.part', "Editor"),
			services: this.services,
			groupViewOptions: this.look.mainPartGroupViewOptions,
		});

		const disposables = new DisposableStore();
		const mainPartOptions = this.look.mainPartOptions;
		if (mainPartOptions) {
			const enforced = disposables.add(new MutableDisposable());
			disposables.add(autorun(reader => enforced.value = part.enforcePartOptions(mainPartOptions.read(reader))));
		}

		// Closes with the window, unless it closed first
		disposables.add(bindEditorPartsToWindow(this.window, [part], this.editorGroupsService));
		disposables.add(Event.once(part.onWillClose)(() => this.parts.deleteAndDispose(part)));
		this.parts.set(part, disposables);

		return { id, part };
	}
}
