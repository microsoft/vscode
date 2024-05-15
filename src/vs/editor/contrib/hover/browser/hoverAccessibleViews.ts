/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { AccessibleViewType, AccessibleViewProviderId, AdvancedContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { HoverVerbosityAction } from 'vs/editor/common/languages';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { selectDescriptionForCommand } from 'vs/workbench/contrib/comments/browser/commentsAccessibility';

export namespace HoverAccessibilityHelpNLS {
	export const intro = nls.localize('intro', "The hover widget is focused. Press the Tab key to cycle through the hover parts.");
	export const increaseVerbosity = nls.localize('increaseVerbosity', "- The current focused hover part's verbosity level can be increased ({0}).");
	export const increaseVerbosityNoKb = nls.localize('increaseVerbosityNoKb', "- The current focused hover part's verbosity level can be increased, which is currently not triggerable via keybinding.");
	export const decreaseVerbosity = nls.localize('decreaseVerbosity', "- The current focused hover part's verbosity level can be decreased ({0}).");
	export const decreaseVerbosityNoKb = nls.localize('decreaseVerbosityNoKb', "- The current focused hover part's verbosity level can be decreased, which is currently not triggerable via keybinding.");
}

export class HoverAccessibleView implements IAccessibleViewImplentation {

	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'hover';
	readonly when = EditorContextKeys.hoverFocused;

	getProvider(accessor: ServicesAccessor): AdvancedContentProvider | undefined {
		return accessor.get(IInstantiationService).createInstance(HoverAccessibilityHelpProvider);
	}
}

export class HoverAccessibilityHelpProvider implements IAccessibleViewContentProvider {

	public id = AccessibleViewProviderId.Hover;
	public verbositySettingKey = 'accessibility.verbosity.hover';
	public options: IAccessibleViewOptions;

	private _editor: ICodeEditor | null;

	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		this._editor = this._codeEditorService.getActiveCodeEditor() || this._codeEditorService.getFocusedCodeEditor();
		this.options = {
			language: this._editor?.getModel()?.getLanguageId() ?? 'typescript',
			type: AccessibleViewType.View
		}
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		return selectDescriptionForCommand(this._keybindingService, commandId, msg, noKbMsg);
	}

	provideContent(): string {

		const content: string[] = [];
		content.push(HoverAccessibilityHelpNLS.intro);

		if (!this._editor) {
			return '';
		}
		const hoverController = HoverController.get(this._editor);
		if (!hoverController) {
			return '';
		}
		const isFocusOnExpandableMarkdownHover = hoverController.isFocusOnMarkdownHoverWhichSupportsVerbosityAction(HoverVerbosityAction.Increase);
		if (isFocusOnExpandableMarkdownHover) {
			content.push(this._descriptionForCommand(INCREASE_HOVER_VERBOSITY_ACTION_ID, HoverAccessibilityHelpNLS.increaseVerbosity, HoverAccessibilityHelpNLS.increaseVerbosityNoKb));
		}
		const isFocusOnContractableMarkdownHover = hoverController.isFocusOnMarkdownHoverWhichSupportsVerbosityAction(HoverVerbosityAction.Decrease);
		if (isFocusOnContractableMarkdownHover) {
			content.push(this._descriptionForCommand(DECREASE_HOVER_VERBOSITY_ACTION_ID, HoverAccessibilityHelpNLS.decreaseVerbosity, HoverAccessibilityHelpNLS.decreaseVerbosityNoKb));
		}
		return content.join('\n');
	}

	onClose(): void {
		if (!this._editor) {
			return;
		}
		HoverController.get(this._editor)?.focus();
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
