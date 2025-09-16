/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './floatingMenu.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from '../../../browser/editorBrowser.js';

export class FloatingEditorToolbarWidget extends Disposable implements IOverlayWidget {
	private readonly _container: HTMLElement;
	private readonly _toolbar: MenuWorkbenchToolBar;

	constructor(
		editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._container = document.createElement('div');
		this._container.classList.add('floating-menu-overlay-widget');

		// Set height explicitly to ensure that the floating menu element
		// is rendered in the lower right corner at the correct position.
		this._container.style.height = '28px';

		this._toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._container, MenuId.EditorContent, {
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			menuOptions: {
				arg: editor.getModel()?.uri,
				shouldForwardArgs: true
			},
			telemetrySource: 'editor.overlayToolbar',
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true
			},
		}));

		this._register(this._toolbar.onDidChangeMenuItems(() => {
			editor.layoutOverlayWidget(this);
		}));
	}

	getDomNode(): HTMLElement {
		return this._container;
	}

	getId(): string {
		return 'editor.overlayWidget.floatingToolbarWidget';
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}
