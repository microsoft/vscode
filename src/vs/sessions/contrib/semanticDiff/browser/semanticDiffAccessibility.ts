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
				localize('semanticDiff.help.filters', "Use Tab to enter the primary type toolbar, Left and Right Arrow to move between controls, and Space or Enter to toggle a type. Each badge counts the group's hunks of that primary type, including when the type is hidden. Enable each type to see all group hunks; disabling every type displays an explicit empty filter result. Secondary types do not control filtering or add to badge counts."),
				localize('semanticDiff.help.markers', "Changed lines have markers matching their type badge color. By default, Logic is purple, Test is teal, Supporting is brown, Generated is blue, and Unclassified is gray. These identify categories, not additions, deletions, or review status. Removed and added lines share the far-left gutter, forming a continuous bar across adjacent changed lines. Unchanged context is not marked. Hover a marker or added code for its type and summary. Native plus and minus gutter signs are hidden. Accessible View includes the type and canonical range without relying on color."),
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
