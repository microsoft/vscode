/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, derived, observableSignalFromEvent, observableValue, runOnChange, waitForState } from '../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InlineChatConfigKeys } from '../common/inlineChat.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { InlineChatEditorAffordance } from './inlineChatEditorAffordance.js';
import { InlineChatInputWidget } from './inlineChatOverlayWidget.js';
import { InlineChatGutterAffordance } from './inlineChatGutterAffordance.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { assertType } from '../../../../base/common/types.js';
import { CursorChangeReason } from '../../../../editor/common/cursorEvents.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';

export class InlineChatAffordance extends Disposable {

	private _menuData = observableValue<{ rect: DOMRect; above: boolean; lineNumber: number } | undefined>(this, undefined);

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _inputWidget: InlineChatInputWidget,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntiteldService: IChatEntitlementService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
	) {
		super();

		const editorObs = observableCodeEditor(this._editor);
		const affordance = observableConfigValue<'off' | 'gutter' | 'editor'>(InlineChatConfigKeys.Affordance, 'off', configurationService);
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
			if (!value || value.isEmpty() || !explicitSelection || _editor.getModel()?.getValueInRange(value).match(/^\s+$/)) {
				selectionData.set(undefined, undefined);
				return;
			}
			selectionData.set(value, undefined);
		}));

		this._store.add(autorun(r => {
			if (chatEntiteldService.sentimentObs.read(r).hidden) {
				selectionData.set(undefined, undefined);
			}
		}));

		const hasSessionObs = derived(r => {
			observableSignalFromEvent(this, inlineChatSessionService.onDidChangeSessions).read(r);
			const model = editorObs.model.read(r);
			return model ? inlineChatSessionService.getSessionByTextModel(model.uri) !== undefined : false;
		});

		this._store.add(autorun(r => {
			if (hasSessionObs.read(r)) {
				selectionData.set(undefined, undefined);
			}
		}));

		this._store.add(this._instantiationService.createInstance(
			InlineChatGutterAffordance,
			editorObs,
			derived(r => affordance.read(r) === 'gutter' ? selectionData.read(r) : undefined),
			this._menuData
		));

		this._store.add(this._instantiationService.createInstance(
			InlineChatEditorAffordance,
			this._editor,
			derived(r => affordance.read(r) === 'editor' ? selectionData.read(r) : undefined)
		));

		this._store.add(autorun(r => {
			const data = this._menuData.read(r);
			if (!data) {
				return;
			}

			// Reveal the line in case it's outside the viewport (e.g., when triggered from sticky scroll)
			this._editor.revealLineInCenterIfOutsideViewport(data.lineNumber, ScrollType.Immediate);

			const editorDomNode = this._editor.getDomNode()!;
			const editorRect = editorDomNode.getBoundingClientRect();
			const left = data.rect.left - editorRect.left;

			// Show the overlay widget
			this._inputWidget.show(data.lineNumber, left, data.above);
		}));

		this._store.add(autorun(r => {
			const pos = this._inputWidget.position.read(r);
			if (pos === null) {
				this._menuData.set(undefined, undefined);
			}
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
			above: direction === SelectionDirection.RTL,
			lineNumber: position.lineNumber
		}, undefined);

		await waitForState(this._inputWidget.position, pos => pos === null);
	}
}
