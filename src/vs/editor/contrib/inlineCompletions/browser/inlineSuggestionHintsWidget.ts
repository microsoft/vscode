/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./inlineSuggestionHintsWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { PositionAffinity } from 'vs/editor/common/model';
import { showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId } from 'vs/editor/contrib/inlineCompletions/browser/consts';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { localize } from 'vs/nls';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export class InlineSuggestionHintsWidget extends Disposable {
	private readonly widget = this._register(this.instantiationService.createInstance(InlineSuggestionHintsContentWidget, this.editor));

	private sessionPosition: Position | undefined = undefined;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly model: InlineCompletionsModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		editor.addContentWidget(this.widget);
		this._register(toDisposable(() => editor.removeContentWidget(this.widget)));
		this._register(model.onDidChange(() => this.update()));
		this._register(editor.onDidChangeConfiguration(() => this.update()));
		this.update();
	}

	private update(): void {
		const options = this.editor.getOption(EditorOption.inlineSuggest);
		if (!options.useExperimentalHints || options.hideHints || !this.model.ghostText) {
			this.widget.update(null, 0, undefined);
			this.sessionPosition = undefined;
			return;
		}

		if (!this.model.completionSession.value) {
			return;
		}

		if (!this.model.completionSession.value.hasBeenTriggeredExplicitly) {
			this.model.completionSession.value.ensureUpdateWithExplicitContext();
		}

		const ghostText = this.model.ghostText;

		const firstColumn = ghostText.parts[0].column;
		if (this.sessionPosition && this.sessionPosition.lineNumber !== ghostText.lineNumber) {
			this.sessionPosition = undefined;
		}

		const position = new Position(ghostText.lineNumber, Math.min(firstColumn, this.sessionPosition?.column ?? Number.MAX_SAFE_INTEGER));
		this.sessionPosition = position;

		this.widget.update(
			this.sessionPosition,
			this.model.completionSession.value.currentlySelectedIndex,
			this.model.completionSession.value.hasBeenTriggeredExplicitly ? this.model.completionSession.value.getInlineCompletionsCountSync() : undefined,
		);
	}
}

const inlineSuggestionHintsNextIcon = registerIcon('inline-suggestion-hints-next', Codicon.chevronRight, localize('parameterHintsNextIcon', 'Icon for show next parameter hint.'));
const inlineSuggestionHintsPreviousIcon = registerIcon('inline-suggestion-hints-previous', Codicon.chevronLeft, localize('parameterHintsPreviousIcon', 'Icon for show previous parameter hint.'));

class InlineSuggestionHintsContentWidget extends Disposable implements IContentWidget {
	private static id = 0;

	private readonly id = `InlineSuggestionHintsContentWidget${InlineSuggestionHintsContentWidget.id++}`;
	public readonly allowEditorOverflow = true;
	public readonly suppressMouseDown = false;

	private readonly nodes = h('div.inlineSuggestionsHints', [
		h('div', { style: { display: 'flex' } }, [
			h('div@actionBar'),
			h('div@toolBar'),
		])
	]);
	private position: Position | null = null;

	private createCommandAction(commandId: string, label: string, iconClassName: string): Action {
		const action = new Action(
			commandId,
			label,
			iconClassName,
			true,
			() => this.commandService.executeCommand(commandId),
		);
		const kb = this.keybindingService.lookupKeybinding(commandId, this._contextKeyService);
		let tooltip = label;
		if (kb) {
			tooltip = localize({ key: 'content', comment: ['A label', 'A keybinding'] }, '{0} ({1})', label, kb.getLabel());
		}
		action.tooltip = tooltip;
		return action;
	}

	private readonly previousAction = this.createCommandAction(showPreviousInlineSuggestionActionId, localize('previous', 'Previous'), ThemeIcon.asClassName(inlineSuggestionHintsPreviousIcon));
	private readonly availableSuggestionCountAction = new Action('inlineSuggestionHints.availableSuggestionCount', '', undefined, false);
	private readonly nextAction = this.createCommandAction(showNextInlineSuggestionActionId, localize('next', 'Next'), ThemeIcon.asClassName(inlineSuggestionHintsNextIcon));

	constructor(
		private readonly editor: ICodeEditor,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		const actionBar = this._register(new ActionBar(this.nodes.actionBar));

		actionBar.push(this.previousAction, { icon: true, label: false });
		actionBar.push(this.availableSuggestionCountAction);
		actionBar.push(this.nextAction, { icon: true, label: false });

		this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.nodes.toolBar, MenuId.InlineSuggestionToolbar, {
			menuOptions: { renderShortTitle: true },
			toolbarOptions: { primaryGroup: 'primary' },
			actionViewItemProvider: (action, options) => {
				return action instanceof MenuItemAction ? instantiationService.createInstance(StatusBarViewItem, action, undefined) : undefined;
			},
		}));
	}

	public update(position: Position | null, currentSuggestionIdx: number, suggestionCount: number | undefined): void {
		this.position = position;

		this.previousAction.enabled = this.nextAction.enabled = suggestionCount !== undefined && suggestionCount > 1;
		this.availableSuggestionCountAction.label = suggestionCount !== undefined ? `${currentSuggestionIdx + 1}/${suggestionCount}` : '1/?';

		this.editor.layoutContentWidget(this);
	}

	getId(): string { return this.id; }

	getDomNode(): HTMLElement {
		return this.nodes.root;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this.position,
			preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW],
			positionAffinity: PositionAffinity.LeftOfInjectedText,
		};
	}
}

class StatusBarViewItem extends MenuEntryActionViewItem {
	protected override updateLabel() {
		const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService);
		if (!kb) {
			return super.updateLabel();
		}
		if (this.label) {
			this.label.textContent = localize({ key: 'content', comment: ['A label', 'A keybinding'] }, '{0} ({1})', this._action.label, kb.getLabel());
		}
	}
}
