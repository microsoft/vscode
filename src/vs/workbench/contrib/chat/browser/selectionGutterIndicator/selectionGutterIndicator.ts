/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, debouncedObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { InlineEditTabAction } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';


export class SelectionGutterIndicatorContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.selectionGutterIndicator';

	public static get(editor: ICodeEditor): SelectionGutterIndicatorContribution | null {
		return editor.getContribution<SelectionGutterIndicatorContribution>(SelectionGutterIndicatorContribution.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const editorObs = observableCodeEditor(this._editor);
		const focusIsInMenu = observableValue<boolean>(this, false);

		// Debounce the selection to add a delay before showing the indicator
		const debouncedSelection = debouncedObservable(editorObs.cursorSelection, 500);

		// Create data observable based on the primary selection
		const data = derived(reader => {
			const selection = debouncedSelection.read(reader);

			// Always show when we have a selection (even if empty)
			if (!selection || selection.isEmpty()) {
				return undefined;
			}

			// Use the cursor position (active end of selection) to determine the line
			const cursorPosition = selection.getPosition();
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

			// Create model with console.log actions for prototyping
			const model = new SimpleInlineSuggestModel(
				() => console.log('[SelectionGutterIndicator] accept'),
				() => console.log('[SelectionGutterIndicator] jump'),
			);

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				model,
				undefined, // altAction
				{
					// styles: {
					// 	background: 'var(--vscode-inlineEdit-gutterIndicator-primaryBackground)',
					// 	foreground: 'var(--vscode-inlineEdit-gutterIndicator-primaryForeground)',
					// 	border: 'var(--vscode-inlineEdit-gutterIndicator-primaryBorder)',
					// },
					icon: Codicon.pencil,
				}
			);
		});

		// Instantiate the gutter indicator
		this._register(this._instantiationService.createInstance(
			SelectionGutterIndicator,
			editorObs,
			data,
			constObservable(InlineEditTabAction.Jump), // tabAction - not used with custom styles
			constObservable(0), // verticalOffset
			constObservable(false), // isHoveringOverInlineEdit
			focusIsInMenu,
		));
	}
}

/**
 * Custom gutter indicator for selection that shows a custom hover.
 */
class SelectionGutterIndicator extends InlineEditsGutterIndicator {
	constructor(
		editorObs: ObservableCodeEditor,
		data: IObservable<InlineEditsGutterIndicatorData | undefined>,
		tabAction: IObservable<InlineEditTabAction>,
		verticalOffset: IObservable<number>,
		isHoveringOverInlineEdit: IObservable<boolean>,
		focusIsInMenu: ISettableObservable<boolean>,
		@IHoverService hoverService: HoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IThemeService themeService: IThemeService,
	) {
		super(editorObs, data, tabAction, verticalOffset, isHoveringOverInlineEdit, focusIsInMenu, hoverService, instantiationService, accessibilityService, themeService);
	}

	protected override _showHover(): void {
		console.log('here');
	}
}

registerEditorContribution(
	SelectionGutterIndicatorContribution.ID,
	SelectionGutterIndicatorContribution,
	EditorContributionInstantiation.AfterFirstRender,
);
