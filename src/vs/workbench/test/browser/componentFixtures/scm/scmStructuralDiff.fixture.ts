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
import { SCMStructuralDiffRenderer } from '../../../../contrib/scm/browser/scmStructuralDiffRenderer.js';
import { ISCMResource } from '../../../../contrib/scm/common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode, getSCMStructuralDiffAriaLabel, getSCMStructuralDiffLabel } from '../../../../contrib/scm/common/scmStructuralDiff.js';
import '../../../../contrib/scm/browser/media/scm.css';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'scm/' }, {
	StructuralChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'A class named Calculator contains a changed calculate method, an added newMethod, and a deleted oldMethod. The changed method has a muted impl annotation without brackets aligned on the right, immediately before its [~] status marker. The signature stays beside the method name. The class and method icons use their respective Outline symbol theme colors, with normal Source Control row spacing. The textual [~], [+], and [-] status markers align on the right, using the corresponding Git decoration theme colors. Added/deleted methods have no change-part annotation, and the unchanged Calculator container has neither an annotation nor a status marker. A warning row below the class says Partial structural changes.',
		],
		render: context => renderStructuralChanges(context, 360),
	}),
	StructuralChangesNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'A narrow Source Control symbol tree keeps its icons and indentation aligned. The long calculate method name and signature truncate with an ellipsis instead of overflowing, while the right-aligned impl annotation without brackets and [~] status marker remain fully visible. Right-aligned [+] and [-] status markers remain visible for added and deleted methods, and a partial-results warning appears below the class.',
		],
		render: context => renderStructuralChanges(context, 220),
	}),
	StructuralDeclarationChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'The changed calculate method has a muted decl annotation without brackets aligned on the right, immediately before its [~] status marker. Its name and signature remain on the left. Added/deleted methods and the unchanged Calculator container have no change-part annotation.',
		],
		render: context => renderStructuralChanges(context, 360, [StructuralDiffClassification.Header]),
	}),
	StructuralDeclarationAndImplementationChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'The changed calculate method has a muted decl+impl annotation without brackets aligned on the right, immediately before its [~] status marker. Its name and signature remain on the left. Added/deleted methods and the unchanged Calculator container have no change-part annotation.',
		],
		render: context => renderStructuralChanges(context, 360, [StructuralDiffClassification.Header, StructuralDiffClassification.Implementation]),
	}),
	StructuralRename: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: [
			'The renamed calculate method has a muted rename annotation without brackets aligned on the right, immediately before its [~] status marker. The displayed name is calculate, while the hover and accessible label identify its previous name compute. Added/deleted methods and the unchanged Calculator container have no rename annotation.',
		],
		render: context => renderStructuralChanges(context, 360, [StructuralDiffClassification.Header], 'compute'),
	}),
});

function renderStructuralChanges({ container, disposableStore, theme }: ComponentFixtureContext, width: number, classifications: readonly StructuralDiffClassification[] = [StructuralDiffClassification.Implementation], originalName?: string): void {
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	container.classList.add('scm-view');
	container.style.width = `${width}px`;
	container.style.height = '132px';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-fontSize-body1)';
	const resource = new class extends mock<ISCMResource>() {
		override readonly sourceUri = URI.file('/workspace/calculator.ts');
	};
	const range = new Range(1, 1, 20, 1);
	const members: SCMStructuralDiffNode[] = [];
	const nodes: StructuralDiffNode[] = [];
	const parent: SCMStructuralDiffNode = {
		type: 'structuralDiff', id: 'class', generation: 1, order: 0, resource, parent: resource, children: members,
		node: {
			id: 'class',
			original: { name: 'Calculator', kind: SymbolKind.Class, range },
			modified: { name: 'Calculator', kind: SymbolKind.Class, range },
			originalChanges: [], modifiedChanges: [], children: nodes,
		},
	};
	for (const [order, status] of ['changed', 'added', 'deleted'].entries()) {
		const name = status === 'changed' ? width < 300 ? 'calculateWithAdditionalValidation' : 'calculate' : status === 'added' ? 'newMethod' : 'oldMethod';
		const entity = { name, kind: SymbolKind.Method, range, detail: status === 'changed' ? '(value: number): number' : undefined };
		const node: StructuralDiffNode = {
			id: status,
			original: status === 'added' ? undefined : status === 'changed' && originalName ? { ...entity, name: originalName } : entity,
			modified: status === 'deleted' ? undefined : entity,
			originalChanges: [],
			modifiedChanges: status === 'changed' ? classifications.map((classification, index) => ({
				textChangeIndex: 0, range: new Range(index + 3, 1, index + 3, 12), classification,
			})) : [],
			children: [],
		};
		nodes.push(node);
		members.push({ type: 'structuralDiff', id: status, generation: 1, order, resource, parent, node, children: [] });
	}
	const elements: SCMStructuralDiffElement[] = [
		parent,
		{ type: 'structuralDiffStatus', id: 'partial', status: 'incomplete', generation: 1, order: 1, resource, parent: resource },
	];
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
	const toTreeElement = (element: SCMStructuralDiffElement): ITreeElement<SCMStructuralDiffElement> => ({
		element,
		collapsed: false,
		children: element.type === 'structuralDiff' ? element.children.map(toTreeElement) : [],
	});
	tree.setChildren(null, elements.map(toTreeElement));
	tree.layout(132, width);
}
