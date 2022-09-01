/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { ILayoutService, ILayoutOffsetInfo } from 'vs/platform/layout/browser/layoutService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class StandaloneLayoutService implements ILayoutService {
	declare readonly _serviceBrand: undefined;

	public onDidLayout = Event.None;

	private _dimension?: dom.IDimension;
	get dimension(): dom.IDimension {
		if (!this._dimension) {
			this._dimension = dom.getClientArea(window.document.body);
		}

		return this._dimension;
	}

	get hasContainer(): boolean {
		return false;
	}

	get container(): HTMLElement {
		// On a page, multiple editors can be created. Therefore, there are multiple containers, not
		// just a single one. Please use `ICodeEditorService` to get the current focused code editor
		// and use its container if necessary. You can also instantiate `EditorScopedLayoutService`
		// which implements `ILayoutService` but is not a part of the service collection because
		// it is code editor instance specific.
		throw new Error(`ILayoutService.container is not available in the standalone editor!`);
	}

	focus(): void {
		this._codeEditorService.getFocusedCodeEditor()?.focus();
	}

	readonly offset: ILayoutOffsetInfo = { top: 0, quickPickTop: 0 };

	constructor(
		@ICodeEditorService private _codeEditorService: ICodeEditorService
	) { }

}

export class EditorScopedLayoutService extends StandaloneLayoutService {
	override get hasContainer(): boolean {
		return false;
	}
	override get container(): HTMLElement {
		return this._container;
	}
	constructor(
		private _container: HTMLElement,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super(codeEditorService);
	}
}

registerSingleton(ILayoutService, StandaloneLayoutService, false);
