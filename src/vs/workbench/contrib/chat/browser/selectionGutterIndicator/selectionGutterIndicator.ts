/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { n } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, debouncedObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { observableCodeEditor, ObservableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { InlineEditTabAction } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from '../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Editor contribution that shows a gutter indicator at the cursor position.
 * The indicator is more prominent when text is selected.
 * This is a prototype for UI exploration.
 */
export class SelectionGutterIndicatorContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.selectionGutterIndicator';

	public static get(editor: ICodeEditor): SelectionGutterIndicatorContribution | null {
		return editor.getContribution<SelectionGutterIndicatorContribution>(SelectionGutterIndicatorContribution.ID);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
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
			if (!selection) {
				return undefined;
			}

			// Use the cursor position (active end of selection) to determine the line
			const cursorPosition = selection.getPosition();
			const lineRange = new LineRange(cursorPosition.lineNumber, cursorPosition.lineNumber + 1);

			// Check if there's actually selected text
			const hasSelection = !selection.isEmpty();

			// Create minimal gutter menu data (empty for prototype)
			const gutterMenuData = new InlineSuggestionGutterMenuData(
				undefined, // action
				'Selection', // displayName
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

			// Use different styles based on whether there's a selection
			const styles = hasSelection
				? {
					// Primary (blue) styling when text is selected
					background: 'var(--vscode-inlineEdit-gutterIndicator-primaryBackground)',
					foreground: 'var(--vscode-inlineEdit-gutterIndicator-primaryForeground)',
					border: 'var(--vscode-inlineEdit-gutterIndicator-primaryBorder)',
				}
				: {
					// Secondary (less prominent) styling when no selection
					background: 'var(--vscode-inlineEdit-gutterIndicator-secondaryBackground)',
					foreground: 'var(--vscode-inlineEdit-gutterIndicator-secondaryForeground)',
					border: 'var(--vscode-inlineEdit-gutterIndicator-secondaryBorder)',
				};

			return new InlineEditsGutterIndicatorData(
				gutterMenuData,
				lineRange,
				model,
				undefined, // altAction
				{
					styles,
					// Use pencil icon
					icon: Codicon.pencil,
					// Custom menu content
					menuContentFactory: (editorObs, close) => createSelectionMenu(editorObs, close, this._commandService),
				}
			);
		});

		// Instantiate the gutter indicator
		this._register(this._instantiationService.createInstance(
			InlineEditsGutterIndicator,
			editorObs,
			data,
			constObservable(InlineEditTabAction.Inactive), // tabAction - not used with custom styles
			constObservable(0), // verticalOffset
			constObservable(false), // isHoveringOverInlineEdit
			focusIsInMenu,
		));
	}
}

/**
 * Creates the custom menu content for the selection gutter indicator.
 */
function createSelectionMenu(editorObs: ObservableCodeEditor, close: (focusEditor: boolean) => void, commandService: ICommandService) {
	const activeElement = observableValue<string | undefined>('active', undefined);

	return n.div({
		class: 'selection-gutter-menu',
		style: { margin: '4px', minWidth: '250px' }
	}, [
		// Header
		n.div({
			style: {
				color: 'var(--vscode-descriptionForeground)',
				fontSize: '13px',
				fontWeight: '600',
				padding: '0 4px',
				lineHeight: '28px',
			}
		}, [localize('selectionActions', "Selection Actions")]),

		// Prompt input box
		n.div({
			style: {
				padding: '4px',
			}
		}, [
			n.elem('input', {
				type: 'text',
				placeholder: localize('promptPlaceholder', "Ask Copilot to Edit..."),
				style: {
					width: '100%',
					padding: '6px 8px',
					border: '1px solid var(--vscode-input-border)',
					borderRadius: '4px',
					backgroundColor: 'var(--vscode-input-background)',
					color: 'var(--vscode-input-foreground)',
					fontSize: '13px',
					boxSizing: 'border-box',
					outline: 'none',
				},
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						const input = e.target as HTMLInputElement;
						const prompt = input.value.trim();
						if (prompt) {
							close(true);
							commandService.executeCommand('inlineChat.start', { message: prompt, autoSend: true });
						}
					} else if (e.key === 'Escape') {
						close(true);
					}
				},
				onfocus: (e: FocusEvent) => {
					const input = e.target as HTMLInputElement;
					input.style.borderColor = 'var(--vscode-focusBorder)';
				},
				onblur: (e: FocusEvent) => {
					const input = e.target as HTMLInputElement;
					input.style.borderColor = 'var(--vscode-input-border)';
				},
			}),
		]),

		// Separator
		createMenuSeparator(),

		// --- Inline Chat Actions ---
		// Option: Edit Selection (runs inlineChat.start)
		createMenuOption({
			id: 'editSelection',
			title: localize('editSelection', "Edit Selection"),
			icon: Codicon.sparkle,
			isActive: activeElement.map(v => v === 'editSelection'),
			onHoverChange: v => activeElement.set(v ? 'editSelection' : undefined, undefined),
			onAction: () => {
				close(true);
				commandService.executeCommand('inlineChat.start');
			}
		}),

		// Separator
		createMenuSeparator(),

		// --- Chat View Actions ---
		// Option: Attach to Chat
		createMenuOption({
			id: 'attachToChat',
			title: localize('attachToChat', "Attach to Chat"),
			icon: Codicon.attach,
			isActive: activeElement.map(v => v === 'attachToChat'),
			onHoverChange: v => activeElement.set(v ? 'attachToChat' : undefined, undefined),
			onAction: () => {
				close(true);
				commandService.executeCommand('workbench.action.chat.attachSelection');
			}
		}),
		// Option: Explain
		createMenuOption({
			id: 'explain',
			title: localize('explain', "Explain"),
			icon: Codicon.comment,
			isActive: activeElement.map(v => v === 'explain'),
			onHoverChange: v => activeElement.set(v ? 'explain' : undefined, undefined),
			onAction: () => {
				close(true);
				commandService.executeCommand('workbench.action.chat.open', { query: '/explain' });
			}
		}),
	]).toDisposableLiveElement();
}

function createMenuSeparator() {
	return n.div({
		class: 'menu-separator',
		style: {
			padding: '4px 0',
		}
	}, [
		n.div({
			style: {
				borderBottom: '1px solid var(--vscode-editorHoverWidget-border)',
			}
		})
	]);
}

function createMenuOption(props: {
	id: string;
	title: string;
	icon: ThemeIcon;
	isActive: IObservable<boolean>;
	onHoverChange: (isHovered: boolean) => void;
	onAction: () => void;
}) {
	return n.div({
		class: ['monaco-menu-option', props.isActive.map(v => v && 'active')],
		onmouseenter: () => props.onHoverChange(true),
		onmouseleave: () => props.onHoverChange(false),
		onclick: props.onAction,
		tabIndex: 0,
		style: { borderRadius: '3px' }
	}, [
		n.elem('span', {
			style: { fontSize: '16px', display: 'flex' }
		}, [renderIcon(props.icon)]),
		n.elem('span', {}, [props.title]),
	]);
}

registerEditorContribution(
	SelectionGutterIndicatorContribution.ID,
	SelectionGutterIndicatorContribution,
	EditorContributionInstantiation.AfterFirstRender,
);
