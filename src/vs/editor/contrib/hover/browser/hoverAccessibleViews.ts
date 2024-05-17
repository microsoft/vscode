/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { AccessibleViewType, AccessibleViewProviderId, AdvancedContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { HoverVerbosityAction } from 'vs/editor/common/languages';
import { DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Action, IAction } from 'vs/base/common/actions';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { IDisposable } from 'vs/base/common/lifecycle';

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

	getProvider(accessor: ServicesAccessor): AdvancedContentProvider | undefined {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return undefined;
		}
		return accessor.get(IInstantiationService).createInstance(HoverAccessibilityHelpProvider, codeEditor);
	}
}

export class HoverAccessibilityHelpProvider implements IAccessibleViewContentProvider {

	public readonly options: IAccessibleViewOptions;
	public readonly id = AccessibleViewProviderId.Hover;
	public readonly verbositySettingKey = 'accessibility.verbosity.hover';
	public readonly actions: IAction[] = [];

	private _onHoverContentsChanged: IDisposable | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		this.options = {
			language: this._editor.getModel()?.getLanguageId() ?? 'typescript',
			type: AccessibleViewType.View
		};
		this.actions.push(new Action(INCREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL, ThemeIcon.asClassName(Codicon.add), true, () => {
			this._editor.getAction(INCREASE_HOVER_VERBOSITY_ACTION_ID)?.run({ focus: false });
		}));
		this.actions.push(new Action(DECREASE_HOVER_VERBOSITY_ACCESSIBLE_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, ThemeIcon.asClassName(Codicon.remove), true, () => {
			this._editor.getAction(DECREASE_HOVER_VERBOSITY_ACTION_ID)?.run({ focus: false });
		}));
	}

	provideContent(): string {
		const content: string[] = [];
		content.push(HoverAccessibilityHelpNLS.intro);
		const hoverController = HoverController.get(this._editor);
		if (!hoverController) {
			return content.join('\n');
		}
		const isFocusOnExpandableMarkdownHover = hoverController.isFocusOnMarkdownHoverWhichSupportsVerbosityAction(HoverVerbosityAction.Increase);
		if (isFocusOnExpandableMarkdownHover) {
			content.push(this._descriptionForCommand(INCREASE_HOVER_VERBOSITY_ACTION_ID, HoverAccessibilityHelpNLS.increaseVerbosity, HoverAccessibilityHelpNLS.increaseVerbosityNoKb));
		}
		const isFocusOnContractableMarkdownHover = hoverController.isFocusOnMarkdownHoverWhichSupportsVerbosityAction(HoverVerbosityAction.Decrease);
		if (isFocusOnContractableMarkdownHover) {
			content.push(this._descriptionForCommand(DECREASE_HOVER_VERBOSITY_ACTION_ID, HoverAccessibilityHelpNLS.decreaseVerbosity, HoverAccessibilityHelpNLS.decreaseVerbosityNoKb));
		}
		const hoverContent = hoverController.lastFocusedMarkdownHoverContent();
		if (hoverContent) {
			content.push('\n' + HoverAccessibilityHelpNLS.hoverContent);
			content.push('\n' + hoverContent);
		}
		this._onHoverContentsChanged?.dispose();
		this._onHoverContentsChanged = hoverController.onHoverContentsChanged(() => {
			this._accessibleViewService.rerender();
		});
		return content.join('\n');
	}

	onClose(): void {
		HoverController.get(this._editor)?.focus();
		this._onHoverContentsChanged?.dispose();
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId);
		if (kb) {
			return format(msg, kb.getAriaLabel());
		}
		return format(noKbMsg, commandId);
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
}
