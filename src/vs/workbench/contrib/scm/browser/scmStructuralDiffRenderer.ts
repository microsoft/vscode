/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { SymbolKinds } from '../../../../editor/common/languages.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffChange, getSCMStructuralDiffChangeAnnotation, getSCMStructuralDiffLabel } from '../common/scmStructuralDiff.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';
import { IEditorOptions, TextEditorSelectionSource } from '../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { localize } from '../../../../nls.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import '../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';

interface StructuralDiffTemplate extends IDisposable {
	readonly icon: HTMLElement;
	readonly label: IconLabel;
	readonly metadata: HTMLElement;
	readonly annotation: HTMLElement;
	readonly status: HTMLElement;
	readonly elementDisposables: DisposableStore;
}

export class SCMStructuralDiffRenderer implements ICompressibleTreeRenderer<SCMStructuralDiffElement, FuzzyScore, StructuralDiffTemplate> {
	static readonly TEMPLATE_ID = 'scmStructuralDiff';
	readonly templateId = SCMStructuralDiffRenderer.TEMPLATE_ID;
	private readonly hoverGroupId = generateUuid();

	constructor(@IHoverService private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): StructuralDiffTemplate {
		const disposables = new DisposableStore();
		const row = append(container, $('.resource.scm-structural-change'));
		const icon = append(row, $('.scm-structural-change-icon'));
		icon.setAttribute('aria-hidden', 'true');
		const label = disposables.add(new IconLabel(append(row, $('.name')), { supportHighlights: true }));
		const metadata = append(row, $('.scm-structural-change-metadata'));
		metadata.setAttribute('aria-hidden', 'true');
		const annotation = append(metadata, $('span.scm-structural-change-annotation'));
		const status = append(metadata, $('.scm-structural-change-status'));
		status.setAttribute('aria-hidden', 'true');
		const elementDisposables = disposables.add(new DisposableStore());
		return { icon, label, metadata, annotation, status, elementDisposables, dispose: () => disposables.dispose() };
	}

	renderElement(node: ITreeNode<SCMStructuralDiffElement, FuzzyScore>, _index: number, template: StructuralDiffTemplate): void {
		const element = node.element;
		const entity = element.type === 'structuralDiff' ? element.node.modified ?? element.node.original : undefined;
		const change = getSCMStructuralDiffChange(element);
		const annotation = getSCMStructuralDiffChangeAnnotation(element);
		template.elementDisposables.clear();
		template.icon.className = 'scm-structural-change-icon';
		template.icon.classList.add(...ThemeIcon.asClassNameArray(entity ? SymbolKinds.toIcon(entity.kind) : Codicon.warning));
		template.icon.classList.toggle('codicon-colored', !!entity);
		template.label.setLabel(getSCMStructuralDiffLabel(element), entity?.detail, {
			title: getSCMStructuralDiffAriaLabel(element),
			matches: createMatches(node.filterData),
			labelEscapeNewLines: true,
		});
		template.annotation.textContent = annotation ? localize('structuralDiff.bracketedAnnotation', "[{0}]", annotation.label) : '';
		template.annotation.style.display = annotation ? '' : 'none';
		template.status.className = 'scm-structural-change-status';
		template.metadata.style.display = change ? '' : 'none';
		if (change) {
			const icon = change.type === 'added' ? Codicon.diffAdded : change.type === 'deleted' ? Codicon.diffRemoved : Codicon.diffModified;
			template.status.classList.add(change.type, ...ThemeIcon.asClassNameArray(icon));
			template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.metadata, {
				content: annotation?.description ?? change.label,
				style: HoverStyle.Mouse,
			}, { groupId: this.hoverGroupId }));
		}
	}

	disposeElement(_node: ITreeNode<SCMStructuralDiffElement, FuzzyScore>, _index: number, template: StructuralDiffTemplate): void {
		template.elementDisposables.clear();
	}

	renderCompressedElements(): void {
		throw new Error('Structural change nodes cannot be compressed');
	}

	disposeTemplate(template: StructuralDiffTemplate): void {
		template.dispose();
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
