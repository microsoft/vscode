/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { status } from 'vs/base/browser/ui/aria/aria';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Event } from 'vs/base/common/event';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Disposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { InteractiveWindowSetting } from 'vs/workbench/contrib/interactive/browser/interactiveCommon';


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
			if (this.editor.hasTextFocus() && this.ariaLabel && configurationService.getValue(AccessibilityVerbositySettingId.ReplInputHint)) {
				status(this.ariaLabel);
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(InteractiveWindowSetting.executeWithShiftEnter)) {
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

			this.ariaLabel = actionPart.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.ReplInputHint));
		}
	}

	private getKeybinding() {
		const keybindings = this.keybindingService.lookupKeybindings('interactive.execute');
		const shiftEnterConfig = this.configurationService.getValue(InteractiveWindowSetting.executeWithShiftEnter);
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
