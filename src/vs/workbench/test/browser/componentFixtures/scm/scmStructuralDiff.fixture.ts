/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ObjectTree } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeElement } from '../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { StructuralDiffClassification, StructuralDiffNode, SymbolKind } from '../../../../../editor/common/languages.js';
import { getListStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { SCMStructuralDiffRenderer } from '../../../../contrib/scm/browser/scmStructuralDiffRenderer.js';
import { ISCMResource } from '../../../../contrib/scm/common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode, SCMStructuralDiffStatus, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffLabel } from '../../../../contrib/scm/common/scmStructuralDiff.js';
import '../../../../browser/parts/views/media/views.css';
import '../../../../contrib/scm/browser/media/scm.css';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { setGitDecorationColors } from './scmFixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'scm/' }, {
	StructuralChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'A class named Calculator contains a changed calculate method, an added newMethod, and a deleted oldMethod. Only the expanded Calculator class has a twistie. The methods and the warning row cannot expand, so like files next to folders in the Explorer they have no twistie, and their icons start in the twistie column. The changed method has a muted impl annotation without brackets aligned on the right, immediately before its M status marker. The signature stays beside the method name. The class and method icons use their respective Outline symbol theme colors, with normal Source Control row spacing. The single-letter M, A, and D status markers align on the right, using the corresponding Git decoration theme colors, dimmed like file badges. Added/deleted methods have no change-part annotation, and the unchanged Calculator container has neither an annotation nor a status marker. A warning row below the class says Partial structural changes.',
		],
		render: context => renderStructuralChanges(context),
	}),
	StructuralChangesSelected: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The changed calculate method is selected in a focused list. Like file badges in selected rows, its M status marker uses the selection foreground together with its name, signature, and impl annotation, while the A and D markers of the other methods keep their Git decoration colors.',
		],
		render: context => renderStructuralChanges(context, { selected: true }),
	}),
	StructuralChangesNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'A narrow Source Control symbol tree keeps its icons and indentation aligned. The long calculate method name and signature truncate with an ellipsis instead of overflowing, while the right-aligned impl annotation without brackets and M status marker remain fully visible. Right-aligned A and D status markers remain visible for added and deleted methods, and a partial-results warning appears below the class.',
		],
		render: context => renderStructuralChanges(context, { width: 220 }),
	}),
	StructuralDeclarationChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The changed calculate method has a muted decl annotation without brackets aligned on the right, immediately before its M status marker. Its name and signature remain on the left. Added/deleted methods and the unchanged Calculator container have no change-part annotation.',
		],
		render: context => renderStructuralChanges(context, { classifications: [StructuralDiffClassification.Header] }),
	}),
	StructuralDeclarationAndImplementationChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The changed calculate method has a muted decl+impl annotation without brackets aligned on the right, immediately before its M status marker. Its name and signature remain on the left. Added/deleted methods and the unchanged Calculator container have no change-part annotation.',
		],
		render: context => renderStructuralChanges(context, { classifications: [StructuralDiffClassification.Header, StructuralDiffClassification.Implementation] }),
	}),
	StructuralRename: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'The renamed calculate method has a right-aligned R status marker retaining the modified-resource theme color, without a change annotation. The displayed name is calculate, while the hover and accessible label identify its previous name compute. Added/deleted methods and the unchanged Calculator container have no change-part annotation.',
		],
		render: context => renderStructuralChanges(context, { classifications: [StructuralDiffClassification.Header], originalName: 'compute' }),
	}),
	StructuralLoadFailures: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Two rows say Unable to load structural changes and Structural changes took too long to load. Each has the same warning icon as the partial-results row, in the regular foreground color, and neither row has a twistie, an annotation, or a status marker.',
		],
		render: context => renderStructuralDiffTree(context, 360, [createStatus('error', 0), createStatus('timedOut', 1)]),
	}),
});

const resource = new class extends mock<ISCMResource>() {
	override readonly sourceUri = URI.file('/workspace/calculator.ts');
};

function createStatus(status: SCMStructuralDiffStatus['status'], order: number): SCMStructuralDiffStatus {
	return { type: 'structuralDiffStatus', id: status, status, generation: 1, order, resource, parent: resource };
}

interface StructuralChangesOptions {
	readonly width?: number;
	readonly classifications?: readonly StructuralDiffClassification[];
	readonly originalName?: string;
	/** Whether the changed method is selected in a focused list. */
	readonly selected?: boolean;
}

function renderStructuralChanges(context: ComponentFixtureContext, { width = 360, classifications = [StructuralDiffClassification.Implementation], originalName, selected = false }: StructuralChangesOptions = {}): void {
	const range = new Range(1, 1, 20, 1);
	const members: SCMStructuralDiffNode[] = [];
	const nodes: StructuralDiffNode[] = [];
	const parent: SCMStructuralDiffNode = {
		type: 'structuralDiff', id: 'class', generation: 1, order: 0, resource, parent: resource, children: members,
		node: {
			id: 'class',
			originalItem: { name: 'Calculator', kind: SymbolKind.Class, range },
			modifiedItem: { name: 'Calculator', kind: SymbolKind.Class, range },
			originalChanges: [], modifiedChanges: [], children: nodes,
		},
	};
	for (const [order, status] of ['changed', 'added', 'deleted'].entries()) {
		const name = status === 'changed' ? width < 300 ? 'calculateWithAdditionalValidation' : 'calculate' : status === 'added' ? 'newMethod' : 'oldMethod';
		const item = { name, kind: SymbolKind.Method, range, detail: status === 'changed' ? '(value: number): number' : undefined };
		const node: StructuralDiffNode = {
			id: status,
			originalItem: status === 'added' ? undefined : status === 'changed' && originalName ? { ...item, name: originalName } : item,
			modifiedItem: status === 'deleted' ? undefined : item,
			originalChanges: [],
			modifiedChanges: status === 'changed' ? classifications.map((classification, index) => ({
				textChangeIndex: 0, range: new Range(index + 3, 1, index + 3, 12), classification,
			})) : [],
			children: [],
		};
		nodes.push(node);
		members.push({ type: 'structuralDiff', id: status, generation: 1, order, resource, parent, node, children: [] });
	}
	renderStructuralDiffTree(context, width, [parent, createStatus('incomplete', 1)], selected ? members[0] : undefined);
}

function renderStructuralDiffTree(context: ComponentFixtureContext, width: number, elements: readonly SCMStructuralDiffElement[], selection?: SCMStructuralDiffElement): void {
	const { container, disposableStore, theme, fileIconTheme } = context;
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	// The SCM view in list mode hides the twisties of rows that cannot expand when the file icon theme has file icons
	container.classList.add('scm-view', 'file-icon-themable-tree');
	container.classList.toggle('align-icons-and-twisties', fileIconTheme.hasFileIcons);
	container.style.width = `${width}px`;
	container.style.fontSize = 'var(--vscode-fontSize-body1)';
	setGitDecorationColors(container);
	const renderer = instantiationService.createInstance(SCMStructuralDiffRenderer);
	const tree = disposableStore.add(new ObjectTree<SCMStructuralDiffElement, FuzzyScore>('SCM structural diff fixture', container, {
		getHeight: () => 22,
		getTemplateId: () => SCMStructuralDiffRenderer.TEMPLATE_ID,
	}, [renderer], {
		identityProvider: { getId: element => element.id },
		keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: getSCMStructuralDiffLabel },
		accessibilityProvider: { getWidgetAriaLabel: () => 'Structural changes', getAriaLabel: getSCMStructuralDiffAriaLabel },
		horizontalScrolling: false,
	}));
	tree.style(getListStyles({}));
	// As in the SCM view, only symbols with children can expand
	const toTreeElement = (element: SCMStructuralDiffElement): ITreeElement<SCMStructuralDiffElement> => ({
		element,
		children: element.type === 'structuralDiff' ? element.children.map(toTreeElement) : [],
	});
	tree.setChildren(null, elements.map(toTreeElement));
	container.style.height = `${tree.contentHeight}px`;
	tree.layout(tree.contentHeight, width);
	if (selection) {
		tree.setFocus([selection]);
		tree.setSelection([selection]);
		context.focus({ focus: () => tree.domFocus() });
	}
}
