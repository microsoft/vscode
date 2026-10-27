/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffDescription, getSCMStructuralDiffLabel } from '../common/scmStructuralDiff.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { IEditorOptions, TextEditorSelectionSource } from '../../../../platform/editor/common/editor.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import '../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';

export class SCMStructuralDiffRenderer implements ICompressibleTreeRenderer<SCMStructuralDiffElement, FuzzyScore, IconLabel> {
	static readonly TEMPLATE_ID = 'scmStructuralDiff';
	readonly templateId = SCMStructuralDiffRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IconLabel {
		const row = append(container, $('.resource.scm-structural-change'));
		return new IconLabel(append(row, $('.name')), { supportHighlights: true });
	}

	renderElement(node: ITreeNode<SCMStructuralDiffElement, FuzzyScore>, _index: number, label: IconLabel): void {
		const element = node.element;
		const entity = element.type === 'structuralDiff' ? element.node.modified ?? element.node.original : undefined;
		label.setLabel(getSCMStructuralDiffLabel(element), getSCMStructuralDiffDescription(element), {
			iconPath: entity ? SymbolKinds.toIcon(entity.kind) : Codicon.warning,
			title: getSCMStructuralDiffAriaLabel(element),
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
		});
	}

	renderCompressedElements(): void {
		throw new Error('Structural change nodes cannot be compressed');
	}

	disposeTemplate(label: IconLabel): void {
		label.dispose();
	}
}

export async function openSCMStructuralDiff(element: SCMStructuralDiffNode, options: IEditorOptions, editorService: IEditorService, isCurrent: () => boolean, sideBySide = false): Promise<void> {
	if (!isCurrent()) {
		return;
	}
	const pane = await editorService.openEditor({
		original: { resource: element.resource.multiDiffEditorOriginalUri! },
		modified: { resource: element.resource.multiDiffEditorModifiedUri! },
		options: { ...options, override: DEFAULT_EDITOR_ASSOCIATION.id },
	}, sideBySide ? SIDE_GROUP : undefined);
	const control = pane?.getControl();
	if (!isDiffEditor(control) || !isCurrent()) {
		return;
	}
	const entity = (element.node.modified ?? element.node.original)!;
	const target = element.node.modified ? control.getModifiedEditor() : control.getOriginalEditor();
	const range = entity.selectionRange ?? entity.range;
	target.setSelection(range, TextEditorSelectionSource.NAVIGATION);
	target.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
	if (!options.preserveFocus) {
		target.focus();
	}
}
