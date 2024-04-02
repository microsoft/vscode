/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { coalesce, firstOrDefault } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILayoutOffsetInfo, ILayoutService } from 'vs/platform/layout/browser/layoutService';

class StandaloneLayoutService implements ILayoutService {
	declare readonly _serviceBrand: undefined;

	readonly onDidLayoutMainContainer = Event.None;
	readonly onDidLayoutActiveContainer = Event.None;
	readonly onDidLayoutContainer = Event.None;
	readonly onDidChangeActiveContainer = Event.None;
	readonly onDidAddContainer = Event.None;

	get mainContainer(): HTMLElement {
		return firstOrDefault(this._codeEditorService.listCodeEditors())?.getContainerDomNode() ?? mainWindow.document.body;
	}

	get activeContainer(): HTMLElement {
		const activeCodeEditor = this._codeEditorService.getFocusedCodeEditor() ?? this._codeEditorService.getActiveCodeEditor();

		return activeCodeEditor?.getContainerDomNode() ?? this.mainContainer;
	}

	get mainContainerDimension(): dom.IDimension {
		return dom.getClientArea(this.mainContainer);
	}

	get activeContainerDimension() {
		return dom.getClientArea(this.activeContainer);
	}

	readonly mainContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };
	readonly activeContainerOffset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };

	get containers(): Iterable<HTMLElement> {
		return coalesce(this._codeEditorService.listCodeEditors().map(codeEditor => codeEditor.getContainerDomNode()));
	}

	getContainer() {
		return this.activeContainer;
	}

	whenContainerStylesLoaded() { return undefined; }

	focus(): void {
		this._codeEditorService.getFocusedCodeEditor()?.focus();
	}

	constructor(
		@ICodeEditorService private _codeEditorService: ICodeEditorService
	) { }

}

export class EditorScopedLayoutService extends StandaloneLayoutService {
	override get mainContainer(): HTMLElement {
		return this._container;
	}
	constructor(
		private _container: HTMLElement,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super(codeEditorService);
	}
}

registerSingleton(ILayoutService, StandaloneLayoutService, InstantiationType.Delayed);
