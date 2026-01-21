/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, derived, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InlineChatConfigKeys } from '../common/inlineChat.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { InlineChatEditorAffordance } from './inlineChatEditorAffordance.js';
import { InlineChatOverlayWidget } from './inlineChatOverlayWidget.js';
import { InlineChatGutterAffordance } from './inlineChatGutterAffordance.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { assertType } from '../../../../base/common/types.js';
import { Event } from '../../../../base/common/event.js';
import { CursorChangeReason } from '../../../../editor/common/cursorEvents.js';

export class InlineChatAffordance extends Disposable {

	private readonly _overlayWidget: InlineChatOverlayWidget;

	private _menuData = observableValue<{ rect: DOMRect; above: boolean } | undefined>(this, undefined);


	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntiteldService: IChatEntitlementService,
	) {
		super();

		// Create the overlay widget once, owned by this class
		this._overlayWidget = this._store.add(this._instantiationService.createInstance(InlineChatOverlayWidget, this._editor));

		const affordance = observableConfigValue<'off' | 'gutter' | 'editor'>(InlineChatConfigKeys.Affordance, 'off', configurationService);

		const editorObs = observableCodeEditor(this._editor);

		const suppressGutter = observableValue<boolean>(this, false);

		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		const selectionData = observableValue<Selection | undefined>(this, undefined);


		let explicitSelection = false;

		this._store.add(runOnChange(editorObs.selections, (value, _prev, events) => {
			explicitSelection = events.every(e => e.reason === CursorChangeReason.Explicit);
			if (!value || value.length !== 1 || value[0].isEmpty() || !explicitSelection) {
				selectionData.set(undefined, undefined);
			}
		}));

		this._store.add(autorun(r => {
			const value = debouncedSelection.read(r);
			if (!value || value.isEmpty() || !explicitSelection) {
				selectionData.set(undefined, undefined);
				return;
			}
			selectionData.set(value, undefined);
		}));

		this._store.add(autorun(r => {
			if (chatEntiteldService.sentimentObs.read(r).hidden) {
				selectionData.set(undefined, undefined);
			}
			if (suppressGutter.read(r)) {
				selectionData.set(undefined, undefined);
			}
		}));

		// Instantiate the gutter indicator
		this._store.add(this._instantiationService.createInstance(
			InlineChatGutterAffordance,
			editorObs,
			derived(r => affordance.read(r) === 'gutter' ? selectionData.read(r) : undefined),
			suppressGutter,
			this._menuData
		));

		// Create content widget (alternative to gutter indicator)
		this._store.add(this._instantiationService.createInstance(
			InlineChatEditorAffordance,
			this._editor,
			derived(r => affordance.read(r) === 'editor' ? selectionData.read(r) : undefined),
			suppressGutter,
			this._menuData
		));

		// Reset suppressGutter when the selection changes
		this._store.add(autorun(reader => {
			editorObs.cursorSelection.read(reader);
			suppressGutter.set(false, undefined);
		}));

		this._store.add(autorun(r => {
			const data = this._menuData.read(r);
			if (!data) {
				return;
			}

			const editorDomNode = this._editor.getDomNode()!;
			const editorRect = editorDomNode.getBoundingClientRect();
			const padding = 1;

			let top: number;
			if (data.above) {
				// Pass the top of the gutter indicator minus padding
				top = data.rect.top - editorRect.top - padding;
			} else {
				// Menu appears below - position at bottom of gutter indicator
				top = data.rect.bottom - editorRect.top + padding;
			}
			const left = data.rect.left - editorRect.left;

			// Show the overlay widget
			this._overlayWidget.show(top, left, data.above);
		}));

		this._store.add(this._overlayWidget.onDidHide(() => {
			suppressGutter.set(true, undefined);
			this._menuData.set(undefined, undefined);
			this._editor.focus();
		}));
	}

	async showMenuAtSelection() {
		assertType(this._editor.hasModel());

		const direction = this._editor.getSelection().getDirection();
		const position = this._editor.getPosition();
		const editorDomNode = this._editor.getDomNode();
		const scrolledPosition = this._editor.getScrolledVisiblePosition(position);
		const editorRect = editorDomNode.getBoundingClientRect();
		const x = editorRect.left + scrolledPosition.left;
		const y = editorRect.top + scrolledPosition.top;

		this._menuData.set({
			rect: new DOMRect(x, y, 0, scrolledPosition.height),
			above: direction === SelectionDirection.RTL
		}, undefined);

		await Event.toPromise(this._overlayWidget.onDidHide);
	}
}
