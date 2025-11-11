/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './editorSelectionWidget.css';
import { localize } from '../../../../../nls.js';
import { $, addDisposableListener, append } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';

const SELECTION_WIDGET_ENABLED_CONFIG = 'editor.selectionWidget.enabled';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		[SELECTION_WIDGET_ENABLED_CONFIG]: {
			type: 'boolean',
			default: true,
			description: localize('selectionWidget.enabled', "Controls whether the selection widget with quick actions appears when you select text in the editor.")
		}
	}
});

export class SelectionWidget extends Disposable implements IContentWidget {

	readonly suppressMouseDown = true;
	readonly allowEditorOverflow = true;

	private readonly domNode = document.createElement('div');

	constructor(
		private readonly editor: ICodeEditor,
		keybindingService: IKeybindingService,
		commandService: ICommandService,
		configurationService: IConfigurationService
	) {
		super();

		this.domNode.classList.add('editor-selection-widget');

		// Quick Edit button (inline chat)
		const inlineChatKeybinding = keybindingService.lookupKeybinding('inlineChat.start')?.getLabel();
		const quickEditButton = this.createButton(
			Codicon.sparkle,
			inlineChatKeybinding ? localize('generate1', "Generate ({0})", inlineChatKeybinding) : localize('generate2', "Generate"),
			() => {
				commandService.executeCommand('inlineChat.start');
				EditorSelectionWidget.get(editor)?.hide();
			}
		);
		append(this.domNode, quickEditButton);

		// Add to Chat button
		const chatKeybinding = keybindingService.lookupKeybinding('workbench.action.chat.open')?.getLabel();
		const addToChatButton = this.createButton(
			Codicon.comment,
			chatKeybinding ? localize('chat1', "Chat ({0})", chatKeybinding) : localize('chat2', "Chat"),
			async () => {
				const model = editor.getModel();
				const selection = editor.getSelection();
				if (model && selection && !selection.isEmpty()) {
					const selectedText = model.getValueInRange(selection);
					await commandService.executeCommand('workbench.action.chat.open', {
						query: selectedText,
						isPartialQuery: true
					});
				}
				EditorSelectionWidget.get(editor)?.hide();
			}
		);
		append(this.domNode, addToChatButton);

		// Close button
		const closeButton = this.createIconButton(
			Codicon.close,
			localize('close', "Don't Show Again"),
			() => {
				configurationService.updateValue(SELECTION_WIDGET_ENABLED_CONFIG, false);
				EditorSelectionWidget.get(editor)?.hide();
			}
		);
		closeButton.classList.add('close-button');
		append(this.domNode, closeButton);
	} private createButton(icon: ThemeIcon, labelText: string, onClick: () => void): HTMLElement {
		const button = $('div.button');
		const iconElement = $('span' + ThemeIcon.asCSSSelector(icon));

		// Parse label to separate text from keybinding
		const match = labelText.match(/^(.+?)\s+\((.+)\)$/);
		if (match) {
			const text = match[1];
			const keybinding = match[2];
			const labelElement = $('span.label', undefined, text + ' ');
			const keybindingElement = $('span.keybinding', undefined, `(${keybinding})`);
			append(button, iconElement, labelElement, keybindingElement);
		} else {
			const labelElement = $('span.label', undefined, labelText);
			append(button, iconElement, labelElement);
		}

		this._register(addDisposableListener(button, 'click', onClick));
		this._register(addDisposableListener(button, 'mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));

		return button;
	}

	private createIconButton(icon: ThemeIcon, tooltip: string, onClick: () => void): HTMLElement {
		const button = $('div.button');
		button.title = tooltip;
		const iconElement = $('span' + ThemeIcon.asCSSSelector(icon));
		append(button, iconElement);

		this._register(addDisposableListener(button, 'click', onClick));
		this._register(addDisposableListener(button, 'mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
		}));

		return button;
	}

	getId(): string {
		return 'editorSelection';
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.editor.hasModel()) {
			return null;
		}

		const selection = this.editor.getSelection();
		if (!selection || selection.isEmpty()) {
			return null;
		}

		return {
			position: selection.getEndPosition(),
			preference: [
				ContentWidgetPositionPreference.BELOW,
				ContentWidgetPositionPreference.ABOVE
			]
		};
	}

	show() {
		this.editor.addContentWidget(this);
	}

	layout(): void {
		this.editor.layoutContentWidget(this);
	}

	hide() {
		this.editor.removeContentWidget(this);
	}
}

export class EditorSelectionWidget extends Disposable implements IEditorContribution {

	static readonly ID = 'editorSelectionWidget';

	static get(editor: ICodeEditor): EditorSelectionWidget | null {
		return editor.getContribution<EditorSelectionWidget>(EditorSelectionWidget.ID);
	}

	private readonly widget: SelectionWidget;
	private readonly sessionDisposables = this._register(new MutableDisposable());
	private debounceTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

	constructor(
		private readonly editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this.widget = this._register(new SelectionWidget(this.editor, keybindingService, commandService, configurationService));

		this._register(this.editor.onDidChangeCursorSelection((e) => {
			this.onSelectionChanged();
		}));

		this._register(this.editor.onDidChangeModelContent(() => {
			// Hide on content change
			this.hide();
		}));
	}

	private onSelectionChanged(): void {
		// Clear any existing timeout
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
		}

		const selection = this.editor.getSelection();
		if (!selection || selection.isEmpty()) {
			this.hide();
			return;
		}

		// Debounce showing the widget to avoid flickering during selection
		this.debounceTimeout = setTimeout(() => {
			const currentSelection = this.editor.getSelection();
			if (currentSelection && !currentSelection.isEmpty()) {
				this.show();
			}
		}, 300);
	}

	private show(): void {
		// Check if the widget is enabled
		if (!this.configurationService.getValue<boolean>(SELECTION_WIDGET_ENABLED_CONFIG)) {
			return;
		}

		const disposables = new DisposableStore();
		this.sessionDisposables.value = disposables;

		this.widget.show();
		disposables.add(toDisposable(() => this.widget.hide()));

		disposables.add(this.editor.onDidChangeCursorPosition(() => {
			const selection = this.editor.getSelection();
			if (!selection || selection.isEmpty()) {
				this.hide();
			} else {
				this.widget.layout();
			}
		}));
	}

	hide(): void {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = undefined;
		}
		this.sessionDisposables.clear();
	}

	override dispose(): void {
		if (this.debounceTimeout) {
			clearTimeout(this.debounceTimeout);
		}
		super.dispose();
	}
}

registerEditorContribution(EditorSelectionWidget.ID, EditorSelectionWidget, EditorContributionInstantiation.Eventually);
