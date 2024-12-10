/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Event } from '../../../../base/common/event.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { ReplEditorSettings } from './interactiveCommon.js';


export class ReplInputHintContentWidget extends Disposable implements IContentWidget {

	private static readonly ID = 'replInput.widget.emptyHint';

	private domNode: HTMLElement | undefined;
	private ariaLabel: string = '';

	constructor(
		private readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
		const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => undefined, 500);
		this._register(onDidFocusEditorText(() => {
			if (this.editor.hasTextFocus() && this.ariaLabel && configurationService.getValue(AccessibilityVerbositySettingId.ReplEditor)) {
				status(this.ariaLabel);
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ReplEditorSettings.executeWithShiftEnter)) {
				this.setHint();
			}
		}));
		this.editor.addContentWidget(this);
	}

	getId(): string {
		return ReplInputHintContentWidget.ID;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = dom.$('.empty-editor-hint');
			this.domNode.style.width = 'max-content';
			this.domNode.style.paddingLeft = '4px';

			this.setHint();

			this._register(dom.addDisposableListener(this.domNode, 'click', () => {
				this.editor.focus();
			}));

			this.editor.applyFontInfo(this.domNode);
		}

		return this.domNode;
	}

	private setHint() {
		if (!this.domNode) {
			return;
		}
		while (this.domNode.firstChild) {
			this.domNode.removeChild(this.domNode.firstChild);
		}

		const hintElement = dom.$('div.empty-hint-text');
		hintElement.style.cursor = 'text';
		hintElement.style.whiteSpace = 'nowrap';

		const keybinding = this.getKeybinding();
		const keybindingHintLabel = keybinding?.getLabel();

		if (keybinding && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Press {0} to execute. ', keybindingHintLabel);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				const hintPart = dom.$('span', undefined, fragment);
				hintPart.style.fontStyle = 'italic';
				return hintPart;
			});

			hintElement.appendChild(before);

			const label = new KeybindingLabel(hintElement, OS);
			label.set(keybinding);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			hintElement.appendChild(after);
			this.domNode.append(hintElement);

			const helpKeybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			const helpInfo = helpKeybinding
				? localize('ReplInputAriaLabelHelp', "Use {0} for accessibility help. ", helpKeybinding)
				: localize('ReplInputAriaLabelHelpNoKb', "Run the Open Accessibility Help command for more information. ");

			this.ariaLabel = actionPart.concat(helpInfo, localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.ReplEditor));
		}
	}

	private getKeybinding() {
		const keybindings = this.keybindingService.lookupKeybindings('interactive.execute');
		const shiftEnterConfig = this.configurationService.getValue(ReplEditorSettings.executeWithShiftEnter);
		const hasEnterChord = (kb: ResolvedKeybinding, modifier: string = '') => {
			const chords = kb.getDispatchChords();
			const chord = modifier + 'Enter';
			const chordAlt = modifier + '[Enter]';
			return chords.length === 1 && (chords[0] === chord || chords[0] === chordAlt);
		};

		if (shiftEnterConfig) {
			const keybinding = keybindings.find(kb => hasEnterChord(kb, 'shift+'));
			if (keybinding) {
				return keybinding;
			}
		} else {
			let keybinding = keybindings.find(kb => hasEnterChord(kb));
			if (keybinding) {
				return keybinding;
			}
			keybinding = this.keybindingService.lookupKeybindings('python.execInREPLEnter')
				.find(kb => hasEnterChord(kb));
			if (keybinding) {
				return keybinding;
			}
		}

		return keybindings?.[0];
	}

	override dispose(): void {
		super.dispose();
		this.editor.removeContentWidget(this);
	}
}
