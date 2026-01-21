/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { InlineEditTabAction } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../platform/hover/browser/hoverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CTX_INLINE_CHAT_GUTTER_VISIBLE } from '../common/inlineChat.js';

export class InlineChatGutterAffordance extends InlineEditsGutterIndicator {


	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		selection: IObservable<Selection | undefined>,
		suppressAffordance: ISettableObservable<boolean>,
		private readonly _hover: ISettableObservable<{ rect: DOMRect; above: boolean } | undefined>,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		const data = derived<InlineEditsGutterIndicatorData | undefined>(r => {
			const value = selection.read(r);
			if (!value || suppressAffordance.read(r)) {
				return undefined;
			}

			// Use the cursor position (active end of selection) to determine the line
			const cursorPosition = value.getPosition();
			const lineRange = new LineRange(cursorPosition.lineNumber, cursorPosition.lineNumber + 1);

			// Create minimal gutter menu data (empty for prototype)
			const gutterMenuData = new InlineSuggestionGutterMenuData(
				undefined, // action
				'', // displayName
				[], // extensionCommands
				undefined, // alternativeAction
				undefined, // modelInfo
				undefined, // setModelId
			);

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				new SimpleInlineSuggestModel(() => { }, () => { }),
				undefined, // altAction
				{
					icon: Codicon.sparkle,
				}
			);
		});

		const focusIsInMenu = observableValue<boolean>({}, false);

		super(
			_myEditorObs, data, constObservable(InlineEditTabAction.Jump), constObservable(0), constObservable(false), focusIsInMenu,
			hoverService, instantiationService, accessibilityService, themeService
		);

		this._store.add(autorun(r => {
			const element = _hover.read(r);
			this._hoverVisible.set(!!element, undefined);
		}));

		// Update context key when gutter visibility changes
		const gutterVisibleCtxKey = CTX_INLINE_CHAT_GUTTER_VISIBLE.bindTo(contextKeyService);
		this._store.add({ dispose: () => gutterVisibleCtxKey.reset() });
		this._store.add(autorun(reader => {
			const isVisible = data.read(reader) !== undefined;
			gutterVisibleCtxKey.set(isVisible);
		}));
	}

	protected override _showHover(): void {

		if (this._hoverVisible.get()) {
			return;
		}

		// Use the icon element from the base class as anchor
		const iconElement = this._iconRef.element;
		if (!iconElement) {
			this._hover.set(undefined, undefined);
			return;
		}

		const selection = this._myEditorObs.cursorSelection.get();
		const direction = selection?.getDirection() ?? SelectionDirection.LTR;
		this._hover.set({ rect: iconElement.getBoundingClientRect(), above: direction === SelectionDirection.RTL }, undefined);
	}


}
