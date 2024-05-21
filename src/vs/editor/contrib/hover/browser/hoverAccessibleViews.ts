/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { AccessibleViewType, AccessibleViewProviderId, AdvancedContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { HoverVerbosityAction } from 'vs/editor/common/languages';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Action, IAction } from 'vs/base/common/actions';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

namespace HoverAccessibilityHelpNLS {
	export const intro = localize('intro', "The hover widget is focused. Press the Tab key to cycle through the hover parts.");
	export const increaseVerbosity = localize('increaseVerbosity', "- The focused hover part verbosity level can be increased ({0}).");
	export const increaseVerbosityNoKb = localize('increaseVerbosityNoKb', "- The focused hover part verbosity level can be increased, which is currently not triggerable via keybinding.");
	export const decreaseVerbosity = localize('decreaseVerbosity', "- The focused hover part verbosity level can be decreased ({0}).");
	export const decreaseVerbosityNoKb = localize('decreaseVerbosityNoKb', "- The focused hover part verbosity level can be decreased, which is currently not triggerable via keybinding.");
	export const hoverContent = localize('contentHover', "The last focused hover content is the following.");
}

export class HoverAccessibleView implements IAccessibleViewImplentation {

	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'hover';
	readonly when = EditorContextKeys.hoverFocused;

	private _provider: HoverAccessibilityHelpProvider | undefined;

	getProvider(accessor: ServicesAccessor): AdvancedContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return undefined;
		}
		this._provider = accessor.get(IInstantiationService).createInstance(HoverAccessibilityHelpProvider, codeEditor);
		return this._provider;
	}

	dispose(): void {
		this._provider?.dispose();
	}
}

export class HoverAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {

	public readonly options: IAccessibleViewOptions;
	public readonly id = AccessibleViewProviderId.Hover;
	public readonly verbositySettingKey = 'accessibility.verbosity.hover';
	public readonly actions: IAction[] = [];

	private readonly _hoverController: HoverController | null = null;
	private _markdownHoverFocusedIndex: number = -1;

	// Listener
	private _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	constructor(
		private readonly _editor: ICodeEditor,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this._hoverController = HoverController.get(this._editor);
		this.options = {
			language: this._editor.getModel()?.getLanguageId(),
			type: AccessibleViewType.View
		};
		this._initializeActions();
		this._hookListeners();
	}

	public provideContent(): string {
		const content: string[] = [HoverAccessibilityHelpNLS.intro];
		if (!this._hoverController) {
			return content.join('\n');
		}
		this._updateMarkdownHoverFocusedIndex(this._hoverController);
		this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = true;
		content.push(...this._descriptionsOfVerbosityActions(this._hoverController));
		content.push(...this._descriptionOfFocusedMarkdownHover(this._hoverController));
		return content.join('\n');
	}

	public onClose(): void {
		if (!this._hoverController) {
			return;
		}
		this._markdownHoverFocusedIndex = -1;
		this._hoverController.focus();
		this._hoverController.shouldKeepOpenOnEditorMouseMoveOrLeave = false;
	}

	private _initializeActions(): void {
		this.actions.push(this._getActionFor(HoverVerbosityAction.Increase));
		this.actions.push(this._getActionFor(HoverVerbosityAction.Decrease));
	}

	private _hookListeners(): void {
		if (!this._hoverController) {
			return;
		}
		this._register(this._hoverController.onHoverContentsChanged(() => {
			this._onDidChangeContent.fire();
		}));
	}

	private _getActionFor(action: HoverVerbosityAction): IAction {
		let actionId: string;
		let accessibleActionId: string;
		let actionLabel: string;
		let actionCodicon: ThemeIcon;
		switch (action) {
			case HoverVerbosityAction.Increase:
				actionId = INCREASE_HOVER_VERBOSITY_ACTION_ID;
				accessibleActionId = INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID;
				actionLabel = INCREASE_HOVER_VERBOSITY_ACTION_LABEL;
				actionCodicon = Codicon.add;
				break;
			case HoverVerbosityAction.Decrease:
				actionId = DECREASE_HOVER_VERBOSITY_ACTION_ID;
				accessibleActionId = DECREASE_HOVER_VERBOSITY_ACTION_ID;
				actionLabel = DECREASE_HOVER_VERBOSITY_ACTION_LABEL;
				actionCodicon = Codicon.remove;
				break;
		}
		return new Action(accessibleActionId, actionLabel, ThemeIcon.asClassName(actionCodicon), true, () => {
			this._editor.getAction(actionId)?.run({ index: this._markdownHoverFocusedIndex, focus: false });
		});
	}

	private _updateMarkdownHoverFocusedIndex(hoverController: HoverController) {
		if (this._markdownHoverFocusedIndex === -1) {
			this._markdownHoverFocusedIndex = hoverController.focusedMarkdownHoverIndex();
		}
	}

	private _descriptionsOfVerbosityActions(hoverController: HoverController): string[] {
		const content: string[] = [];
		const descriptionForIncreaseAction = this._descriptionOfVerbosityAction(hoverController, HoverVerbosityAction.Increase);
		if (descriptionForIncreaseAction !== undefined) {
			content.push(descriptionForIncreaseAction);
		}
		const descriptionForDecreaseAction = this._descriptionOfVerbosityAction(hoverController, HoverVerbosityAction.Decrease);
		if (descriptionForDecreaseAction !== undefined) {
			content.push(descriptionForDecreaseAction);
		}
		return content;
	}

	private _descriptionOfVerbosityAction(hoverController: HoverController, action: HoverVerbosityAction): string | undefined {
		const isActionSupported = hoverController.doesMarkdownHoverAtIndexSupportVerbosityAction(this._markdownHoverFocusedIndex, action);
		if (!isActionSupported) {
			return;
		}
		let actionId: string;
		let descriptionWithKb: string;
		let descriptionWithoutKb: string;
		switch (action) {
			case HoverVerbosityAction.Increase:
				actionId = INCREASE_HOVER_VERBOSITY_ACTION_ID;
				descriptionWithKb = HoverAccessibilityHelpNLS.increaseVerbosity;
				descriptionWithoutKb = HoverAccessibilityHelpNLS.increaseVerbosityNoKb;
				break;
			case HoverVerbosityAction.Decrease:
				actionId = DECREASE_HOVER_VERBOSITY_ACTION_ID;
				descriptionWithKb = HoverAccessibilityHelpNLS.decreaseVerbosity;
				descriptionWithoutKb = HoverAccessibilityHelpNLS.decreaseVerbosityNoKb;
				break;
		}
		return this._descriptionForCommand(actionId, descriptionWithKb, descriptionWithoutKb);
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		return kb ? format(msg, kb.getAriaLabel()) : format(noKbMsg, commandId);
	}

	private _descriptionOfFocusedMarkdownHover(hoverController: HoverController): string[] {
		const content: string[] = [];
		const hoverContent = hoverController.markdownHoverContentAtIndex(this._markdownHoverFocusedIndex);
		if (hoverContent) {
			content.push('\n' + HoverAccessibilityHelpNLS.hoverContent);
			content.push('\n' + hoverContent);
		}
		return content;
	}
}

export class ExtHoverAccessibleView implements IAccessibleViewImplentation {

	readonly type = AccessibleViewType.View;
	readonly priority = 90;
	readonly name = 'extension-hover';

	getProvider(accessor: ServicesAccessor): AdvancedContentProvider | undefined {
		const contextViewService = accessor.get(IContextViewService);
		const contextViewElement = contextViewService.getContextViewElement();
		const extensionHoverContent = contextViewElement?.textContent ?? undefined;
		const hoverService = accessor.get(IHoverService);

		if (contextViewElement.classList.contains('accessible-view-container') || !extensionHoverContent) {
			// The accessible view, itself, uses the context view service to display the text. We don't want to read that.
			return;
		}
		return {
			id: AccessibleViewProviderId.Hover,
			verbositySettingKey: 'accessibility.verbosity.hover',
			provideContent() { return extensionHoverContent; },
			onClose() {
				hoverService.showAndFocusLastHover();
			},
			options: { language: 'typescript', type: AccessibleViewType.View }
		};
	}

	dispose() { }
}
