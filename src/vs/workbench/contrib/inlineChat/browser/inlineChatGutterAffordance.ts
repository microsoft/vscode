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
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../platform/hover/browser/hoverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ACTION_START } from '../common/inlineChat.js';

export class InlineChatGutterAffordance extends InlineEditsGutterIndicator {

	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		selection: IObservable<Selection | undefined>,
		private readonly _hover: ISettableObservable<{ rect: DOMRect; above: boolean; lineNumber: number } | undefined>,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		const data = derived<InlineEditsGutterIndicatorData | undefined>(r => {
			const value = selection.read(r);
			if (!value) {
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
				new SimpleInlineSuggestModel(() => { }, () => this._doShowHover()),
				undefined, // altAction
				{
					icon: Codicon.sparkle,
				}
			);
		});

		const focusIsInMenu = observableValue<boolean>({}, false);

		super(
			_myEditorObs, data, constObservable(InlineEditTabAction.Inactive), constObservable(0), constObservable(false), focusIsInMenu,
			hoverService, instantiationService, accessibilityService, themeService
		);

		this._store.add(autorun(r => {
			const element = _hover.read(r);
			this._hoverVisible.set(!!element, undefined);
		}));
	}

	protected override _showHover(): void {
		this._hoverService.showInstantHover({
			target: this._iconRef.element,
			content: this._keybindingService.appendKeybinding(localize('inlineChatGutterHover', "Inline Chat"), ACTION_START),
			// appearance: { showPointer: true }
		});
	}

	private _doShowHover(): void {
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
		const lineNumber = selection?.getPosition().lineNumber ?? 1;
		this._hover.set({ rect: iconElement.getBoundingClientRect(), above: direction === SelectionDirection.RTL, lineNumber }, undefined);
	}

}
