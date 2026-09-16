/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { SemanticDiffEditor } from './semanticDiffEditor.js';
import { SemanticDiffEditorFocused } from './semanticDiffEditorWidget.js';

export class SemanticDiffAccessibility implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'semanticDiff';
	readonly when = SemanticDiffEditorFocused;

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof SemanticDiffEditor)) {
			return undefined;
		}
		const restoreFocus = editor.captureFocus();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.SemanticDiff,
			{ type: this.type, language: 'plaintext' },
			() => this.type === AccessibleViewType.Help ? [
				localize('semanticDiff.help.overview', "You are in a read-only semantic group diff. It presents one classified group using verified, recorded source. It cannot edit, save, stage, revert, apply, or mark changes as reviewed."),
				localize('semanticDiff.help.filters', "Use Tab to enter the hunk type toolbar, Left and Right Arrow to move between controls, and Space or Enter to toggle a type. Each badge counts the group's Logic, Test, or Supporting hunks, including when the type is hidden. Enable each type to see all group hunks; disabling every type displays an explicit empty filter result."),
				localize('semanticDiff.help.markers', "Every changed line uses its hunk type color: Logic is purple, Test teal, and Supporting brown by default. Hot attention uses full emphasis, Warm a moderate shade, and Cold a quiet shade of that color. In high contrast themes, Hot is solid, Warm dashed, and Cold dotted. Attention is independent of hunk type and classification confidence; it suggests reading order, not safety, approval, or which lines can be skipped. Hover a marker or changed line for its hunk type, attention level, and reason. Accessible View includes the same information and canonical ranges without relying on color. Removed and added lines share the far-left gutter; unchanged context is not marked. Native plus and minus gutter signs are hidden."),
				localize('semanticDiff.help.source', "The editor header contains only the filter toolbar. Accessible View includes the comparison, partial classification, source readiness, and visible and total hunk and file counts. Loading, source errors, and empty-filter messages appear in the editor body. Retry Source retries unavailable source; filtering never reloads source."),
				localize('semanticDiff.help.lines', "Diffs always render inline. Original line numbers refer to the comparison baseline. Modified line numbers refer to the filtered projection, not the complete target file, and must not be used as target-file coordinates."),
				localize('semanticDiff.help.navigation', "Tab into file headers and press Enter or Space to expand or collapse a file. The embedded read-only diff editors support native keyboard and screen-reader diff navigation. Expanding unchanged regions reveals baseline context, never excluded changes."),
				localize('semanticDiff.help.view', "Open Accessible View {0} for selected hunk explanations, uncertainty, canonical original and target ranges, projected ranges, limitations, and full baseline and projection text. Escape returns focus to the control you were using.", '<keybinding:editor.action.accessibleView>'),
			].join('\n') : editor.getAccessibleContent() ?? '',
			restoreFocus,
			AccessibilityVerbositySettingId.SemanticDiff,
		);
	}
}
