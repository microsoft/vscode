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
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';

type InlineChatAffordanceEvent = {
	mode: string;
	id: string;
	commandId: string;
};

type InlineChatAffordanceClassification = {
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The affordance mode: gutter or editor.' };
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'UUID to correlate shown and selected events.' };
	commandId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The command that was executed.' };
	owner: 'jrieken';
	comment: 'Tracks when the inline chat affordance is shown or selected.';
};

export class InlineChatAffordance extends Disposable {

	readonly #editor: ICodeEditor;
	readonly #inputWidget: InlineChatInputWidget;
	readonly #instantiationService: IInstantiationService;
	readonly #menuData = observableValue<{ rect: DOMRect; above: boolean; lineNumber: number } | undefined>(this, undefined);

	constructor(
		editor: ICodeEditor,
		inputWidget: InlineChatInputWidget,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntiteldService: IChatEntitlementService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this.#editor = editor;
		this.#inputWidget = inputWidget;
		this.#instantiationService = instantiationService;

		const editorObs = observableCodeEditor(this.#editor);
		const affordance = observableConfigValue<'off' | 'gutter' | 'editor'>(InlineChatConfigKeys.Affordance, 'off', configurationService);
		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		const selectionData = observableValue<Selection | undefined>(this, undefined);

		let explicitSelection = false;
		let affordanceId: string | undefined;

		this._store.add(runOnChange(editorObs.selections, (value, _prev, events) => {
			explicitSelection = events.every(e => e.reason === CursorChangeReason.Explicit);
			if (!value || value.length !== 1 || value[0].isEmpty() || !explicitSelection) {
				selectionData.set(undefined, undefined);
			}
		}));

		this._store.add(autorun(r => {
			const value = debouncedSelection.read(r);
			if (!value || value.isEmpty() || !explicitSelection || this.#editor.getModel()?.getValueInRange(value).match(/^\s+$/)) {
				selectionData.set(undefined, undefined);
				affordanceId = undefined;
				return;
			}
			affordanceId = generateUuid();
			const mode = affordance.read(undefined);
			if (mode === 'gutter' || mode === 'editor') {
				telemetryService.publicLog2<InlineChatAffordanceEvent, InlineChatAffordanceClassification>('inlineChatAffordance/shown', { mode, id: affordanceId, commandId: '' });
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

		// Hide when the editor context menu shows
		this._store.add(this.#editor.onContextMenu(() => {
			selectionData.set(undefined, undefined);
		}));

		const gutterAffordance = this._store.add(this.#instantiationService.createInstance(
			InlineChatGutterAffordance,
			editorObs,
			derived(r => affordance.read(r) === 'gutter' ? selectionData.read(r) : undefined),
			this.#menuData
		));

		const editorAffordance = this.#instantiationService.createInstance(
			InlineChatEditorAffordance,
			this.#editor,
			derived(r => affordance.read(r) === 'editor' ? selectionData.read(r) : undefined)
		);
		this._store.add(editorAffordance);

		this._store.add(Event.any(editorAffordance.onDidRunAction, gutterAffordance.onDidRunAction)(commandId => {
			if (affordanceId) {
				telemetryService.publicLog2<InlineChatAffordanceEvent, InlineChatAffordanceClassification>('inlineChatAffordance/selected', { mode: affordance.get(), id: affordanceId, commandId });
			}
		}));

		this._store.add(autorun(r => {
			const mode = affordance.read(r);
			const hideWithSelection = mode === 'editor' || mode === 'gutter';
			const controller = CodeActionController.get(this.#editor);
			if (controller) {
				controller.onlyLightBulbWithEmptySelection = hideWithSelection;
			}
		}));

		this._store.add(autorun(r => {
			const data = this.#menuData.read(r);
			if (!data) {
				return;
			}

			// Reveal the line in case it's outside the viewport (e.g., when triggered from sticky scroll)
			this.#editor.revealLineInCenterIfOutsideViewport(data.lineNumber, ScrollType.Immediate);

			const editorDomNode = this.#editor.getDomNode()!;
			const editorRect = editorDomNode.getBoundingClientRect();
			const left = data.rect.left - editorRect.left;

			// Show the overlay widget
			this.#inputWidget.show(data.lineNumber, left, data.above);
		}));

		this._store.add(autorun(r => {
			const pos = this.#inputWidget.position.read(r);
			if (pos === null) {
				this.#menuData.set(undefined, undefined);
			}
		}));
	}

	async showMenuAtSelection() {
		assertType(this.#editor.hasModel());

		const direction = this.#editor.getSelection().getDirection();
		const position = this.#editor.getPosition();
		const editorDomNode = this.#editor.getDomNode();
		const scrolledPosition = this.#editor.getScrolledVisiblePosition(position);
		const editorRect = editorDomNode.getBoundingClientRect();
		const x = editorRect.left + scrolledPosition.left;
		const y = editorRect.top + scrolledPosition.top;

		this.#menuData.set({
			rect: new DOMRect(x, y, 0, scrolledPosition.height),
			above: direction === SelectionDirection.RTL,
			lineNumber: position.lineNumber
		}, undefined);

		await waitForState(this.#inputWidget.position, pos => pos === null);
	}
}
