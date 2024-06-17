/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { status } from 'vs/base/browser/ui/aria/aria';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { OS } from 'vs/base/common/platform';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { editorActiveLinkForeground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { resolveColorValue } from 'vs/platform/theme/common/colorUtils';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { InteractiveWindowSetting } from 'vs/workbench/contrib/interactive/browser/interactiveCommon';


export class ReplInputHintContentWidget extends Disposable implements IContentWidget {

	private static readonly ID = 'replInput.widget.emptyHint';

	private domNode: HTMLElement | undefined;
	private isVisible = false;
	private ariaLabel: string = '';

	constructor(
		private readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
		const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => undefined, 500);
		this._register(onDidFocusEditorText(() => {
			if (this.editor.hasTextFocus() && this.isVisible && this.ariaLabel && configurationService.getValue(AccessibilityVerbositySettingId.ReplInputHint)) {
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
			this.domNode = dom.$('.repl-input-hint');
			this.domNode.style.width = 'max-content';
			this.domNode.style.paddingLeft = '4px';

			const ariaLabel = this.setHint();

			this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.ReplInputHint));

			this._register(dom.addDisposableListener(this.domNode, 'click', () => {
				this.editor.focus();
			}));

			this.editor.applyFontInfo(this.domNode);
		}

		return this.domNode;
	}

	private setHint() {
		if (!this.domNode) {
			return '';
		}
		const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
		const linkForeground = this.themeService.getColorTheme().getColor(editorActiveLinkForeground);

		const hintElement = dom.$('empty-hint-text');
		hintElement.style.display = 'block';
		hintElement.style.color = transparentForeground?.toString() || '';
		hintElement.style.cursor = 'text';

		const keybinding = this.getKeybinding();
		const keybindingHintLabel = keybinding?.getLabel();

		if (keybinding && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Enter code and press {0} to execute. ', keybindingHintLabel);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				const hintPart = dom.$('span', undefined, fragment);
				hintPart.style.fontStyle = 'italic';
				return hintPart;
			});

			hintElement.appendChild(before);

			const configLink = dom.$('a', { href: '#' });
			configLink.style.color = linkForeground?.toString() || '';
			configLink.onclick = (e) => {
				e.preventDefault();
				this.commandService.executeCommand('workbench.action.openSettings', { query: '@tag:replExecute' });
			};
			hintElement.appendChild(configLink);

			const label = new KeybindingLabel(configLink, OS);
			label.set(keybinding);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			hintElement.appendChild(after);

			this.domNode.append(hintElement);
			return '';
		} else {
			return '';
		}
	}

	private getKeybinding() {

		const keybindings = this.keybindingService.lookupKeybindings('interactive.execute');
		const shiftEnterConfig = this.configurationService.getValue(InteractiveWindowSetting.executeWithShiftEnter);

		if (shiftEnterConfig) {
			const keybinding = keybindings.find(kb => kb.getLabel() === 'Shift+Enter');
			if (keybinding) {
				return keybinding;
			}
		} else {
			const keybinding = keybindings.find(kb => kb.getLabel() === 'Enter');
			if (keybinding) {
				return keybinding;
			}
		}

		return this.keybindingService.lookupKeybinding('interactive.execute', this.contextKeyService);
	}

	override dispose(): void {
		super.dispose();
		this.editor.removeContentWidget(this);
	}
}
