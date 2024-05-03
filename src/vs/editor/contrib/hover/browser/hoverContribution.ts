/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DecreaseHoverVerbosityLevel, GoToBottomHoverAction, GoToTopHoverAction, IncreaseHoverVerbosityLevel, PageDownHoverAction, PageUpHoverAction, ScrollDownHoverAction, ScrollLeftHoverAction, ScrollRightHoverAction, ScrollUpHoverAction, ShowDefinitionPreviewHoverAction, ShowOrFocusHoverAction } from 'vs/editor/contrib/hover/browser/hoverActions';
import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { MarkdownHoverParticipant } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import { MarkerHoverParticipant } from 'vs/editor/contrib/hover/browser/markerHoverParticipant';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import 'vs/css!./hover';
import { AccessibleViewImplentation, AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';

registerEditorContribution(HoverController.ID, HoverController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(ShowOrFocusHoverAction);
registerEditorAction(ShowDefinitionPreviewHoverAction);
registerEditorAction(ScrollUpHoverAction);
registerEditorAction(ScrollDownHoverAction);
registerEditorAction(ScrollLeftHoverAction);
registerEditorAction(ScrollRightHoverAction);
registerEditorAction(PageUpHoverAction);
registerEditorAction(PageDownHoverAction);
registerEditorAction(GoToTopHoverAction);
registerEditorAction(GoToBottomHoverAction);
registerEditorAction(IncreaseHoverVerbosityLevel);
registerEditorAction(DecreaseHoverVerbosityLevel);
HoverParticipantRegistry.register(MarkdownHoverParticipant);
HoverParticipantRegistry.register(MarkerHoverParticipant);

// theming
registerThemingParticipant((theme, collector) => {
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-editor .monaco-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-editor .monaco-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
	}
});
const implementation: AccessibleViewImplentation = {
	priority: 95, name: 'hover', implementation: accessor => {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		const editorHoverContent = editor ? HoverController.get(editor)?.getWidgetContent() ?? undefined : undefined;
		if (!editor || !editorHoverContent) {
			return false;
		}
		const language = editor?.getModel()?.getLanguageId() ?? 'typescript';
		accessibleViewService.show({
			id: AccessibleViewProviderId.Hover,
			verbositySettingKey: 'accessibility.verbosity.hover',
			provideContent() { return editorHoverContent; },
			onClose() {
				HoverController.get(editor)?.focus();
			},
			options: { language, type: AccessibleViewType.View }
		});
		return true;
	}, when: EditorContextKeys.hoverFocused
};
const extImplementation: AccessibleViewImplentation = {
	priority: 90, name: 'extension-hover', implementation: accessor => {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const contextViewService = accessor.get(IContextViewService);
		const contextViewElement = contextViewService.getContextViewElement();
		const extensionHoverContent = contextViewElement?.textContent ?? undefined;
		const hoverService = accessor.get(IHoverService);

		if (contextViewElement.classList.contains('accessible-view-container') || !extensionHoverContent) {
			// The accessible view, itself, uses the context view service to display the text. We don't want to read that.
			return false;
		}
		accessibleViewService.show({
			id: AccessibleViewProviderId.Hover,
			verbositySettingKey: 'accessibility.verbosity.hover',
			provideContent() { return extensionHoverContent; },
			onClose() {
				hoverService.showAndFocusLastHover();
			},
			options: { language: 'typescript', type: AccessibleViewType.View }
		});
		return true;
	}
};
AccessibleViewRegistry.registerImplementation(implementation);
AccessibleViewRegistry.registerImplementation(extImplementation);
