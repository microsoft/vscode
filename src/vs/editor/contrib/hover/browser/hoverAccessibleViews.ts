/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { AccessibleViewType, AccessibleViewProviderId } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class HoverAccessibleView implements IAccessibleViewImplentation {
	readonly type = AccessibleViewType.View;
	readonly priority = 95;
	readonly name = 'hover';
	readonly when = EditorContextKeys.hoverFocused;
	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		const editorHoverContent = editor ? HoverController.get(editor)?.getWidgetContent() ?? undefined : undefined;
		if (!editor || !editorHoverContent) {
			return;
		}
		return {
			id: AccessibleViewProviderId.Hover,
			verbositySettingKey: 'accessibility.verbosity.hover',
			provideContent() { return editorHoverContent; },
			onClose() {
				HoverController.get(editor)?.focus();
			},
			options: {
				language: editor?.getModel()?.getLanguageId() ?? 'typescript',
				type: AccessibleViewType.View
			}
		};
	}
}

export class ExtHoverAccessibleView implements IAccessibleViewImplentation {
	readonly type = AccessibleViewType.View;
	readonly priority = 90;
	readonly name = 'extension-hover';
	getProvider(accessor: ServicesAccessor) {
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
