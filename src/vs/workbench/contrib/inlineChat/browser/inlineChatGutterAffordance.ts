/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ObservableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { InlineCompletionCommand } from '../../../../editor/common/languages.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { InlineEditTabAction } from '../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../platform/hover/browser/hoverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';

export class InlineChatGutterAffordance extends InlineEditsGutterIndicator {

	private readonly _onDidRunAction = this._store.add(new Emitter<string>());
	readonly onDidRunAction: Event<string> = this._onDidRunAction.event;

	constructor(
		private readonly _myEditorObs: ObservableCodeEditor,
		selection: IObservable<Selection | undefined>,
		private readonly _hover: ISettableObservable<{ rect: DOMRect; above: boolean; lineNumber: number } | undefined>,
		@IKeybindingService _keybindingService: IKeybindingService,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
		@IUserInteractionService userInteractionService: IUserInteractionService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		const menu = menuService.createMenu(MenuId.InlineChatEditorAffordance, contextKeyService);
		const menuObs = observableFromEvent(menu.onDidChange, () => menu.getActions({ renderShortTitle: false }));

		const codeActionController = CodeActionController.get(_myEditorObs.editor);
		const lightBulbObs = codeActionController?.lightBulbState;

		const data = derived<InlineEditsGutterIndicatorData | undefined>(r => {
			const value = selection.read(r);
			if (!value) {
				return undefined;
			}

			const commandGroups: InlineCompletionCommand[][] = [];
			for (const [, groupActions] of menuObs.read(r)) {
				const group: InlineCompletionCommand[] = [];
				for (const action of groupActions) {
					if (action instanceof MenuItemAction) {
						group.push({
							command: { id: action.item.id, title: action.label },
							icon: ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined
						});
					}
				}
				if (group.length > 0) {
					commandGroups.push(group);
				}
			}

			// Use the cursor position (active end of selection) to determine the line
			const cursorPosition = value.getPosition();
			const lineRange = new LineRange(cursorPosition.lineNumber, cursorPosition.lineNumber + 1);

			// Create minimal gutter menu data (empty for prototype)
			const gutterMenuData = new InlineSuggestionGutterMenuData(
				undefined, // action
				'', // displayName
				commandGroups, // extensionCommands
				undefined, // alternativeAction
				undefined, // modelInfo
				undefined, // setModelId
				true, // extensionCommandsOnly
			);

			// Use lightbulb icon/color when code actions are available, otherwise sparkle
			const lightBulbInfo = lightBulbObs?.read(r);
			const icon = lightBulbInfo ? lightBulbInfo.icon : Codicon.sparkle;

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				new SimpleInlineSuggestModel(() => { }, () => this._doShowHover()),
				undefined, // altAction
				{ icon }
			);
		});

		const focusIsInMenu = observableValue<boolean>({}, false);

		super(
			_myEditorObs, data, constObservable(InlineEditTabAction.Inactive), constObservable(0), constObservable(false), focusIsInMenu,
			hoverService, instantiationService, accessibilityService, themeService, userInteractionService
		);

		this._store.add(menu);

		this._store.add(autorun(r => {
			const element = _hover.read(r);
			this._hoverVisible.set(!!element, undefined);
		}));

		this._store.add(this.onDidCloseWithCommand(commandId => this._onDidRunAction.fire(commandId)));
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
