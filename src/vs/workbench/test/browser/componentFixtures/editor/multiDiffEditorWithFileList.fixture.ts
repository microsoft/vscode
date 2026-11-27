/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { StructuralDiff, StructuralDiffClassification, StructuralDiffContext, StructuralDiffCoverage, StructuralDiffItem, StructuralDiffNode, StructuralDiffProvider, SymbolKind } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { MultiDiffEditorWithFileListWidget } from '../../../../contrib/multiDiffEditor/browser/multiDiffEditorWithFileListWidget.js';
import { MultiDiffEditorFileListPosition, MultiDiffEditorFileListViewMode } from '../../../../contrib/multiDiffEditor/common/multiDiffEditor.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureDomCondition } from '../fixtureUtils.js';
import { createMultiDiffEditorFixtureDocument, createMultiDiffEditorFixtureServices, FixtureWorkbenchUIElementFactory } from './multiDiffEditorFixtureUtils.js';

interface IFileListFixtureOptions {
	readonly width: number;
	readonly viewMode?: MultiDiffEditorFileListViewMode;
	readonly position?: MultiDiffEditorFileListPosition;
	/** Whether the list shows structural changes, with greet.ts expanded to the functions that changed in it. */
	readonly structuralChanges?: boolean;
}

async function renderMultiDiffEditorWithFileListWidget(context: ComponentFixtureContext, { width, viewMode = 'list', position = 'right', structuralChanges = false }: IFileListFixtureOptions): Promise<void> {
	const { container, disposableStore, disposableStackStore, theme } = context;
	const height = 480;
	container.style.width = `${width}px`;
	container.style.height = `${height}px`;

	const instantiationService = createMultiDiffEditorFixtureServices(disposableStore, theme, new TestDiffProviderFactoryService(), structuralChanges);
	if (structuralChanges) {
		disposableStore.add(instantiationService.get(ILanguageFeaturesService).structuralDiffProvider.register({ pattern: '**/*.ts' }, new FixtureStructuralDiffProvider()));
	}
	const textModels = disposableStackStore.add(new DisposableStore());
	const document = (original: string | undefined, modified: string | undefined, originalText = 'export const value = 1;\n', modifiedText = 'export const value = 2;\n') => createMultiDiffEditorFixtureDocument(instantiationService, textModels, {
		original: original ? { uri: `inmemory://original/${original}`, text: originalText } : undefined,
		modified: modified ? { uri: `inmemory://modified/${modified}`, text: modifiedText } : undefined,
	});
	const [greetOriginal, greetModified] = structuralChanges ? [greetOriginalText, greetModifiedText] : [];
	const documents = [
		document('src/server/greet.ts', 'src/server/greet.ts', greetOriginal, greetModified),
		document(undefined, 'src/server/routes.ts', undefined, 'export const routes = [];\n'),
		document('src/legacy/config.ts', undefined, 'export const config = {};\n'),
		document('src/util/strings.ts', 'src/common/strings.ts'),
		document('test/server.test.ts', 'test/server.test.ts'),
	];

	const fileListVisible = observableValue('fileListVisible', true);
	const composite = disposableStackStore.add(instantiationService.createInstance(
		MultiDiffEditorWithFileListWidget,
		container,
		instantiationService.createInstance(FixtureWorkbenchUIElementFactory),
		{ variant: 'noCards' },
		fileListVisible,
		constObservable(viewMode),
		constObservable(position),
	));
	const widget = composite.multiDiffEditorWidget;
	const viewModel = disposableStackStore.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) }));
	widget.setViewModel(viewModel, { preserveFocus: true });
	// Like an editor pane, clear the view model before the widget is disposed. Hide the
	// file list first so its tree is not disposed with an update still pending.
	disposableStackStore.add(toDisposable(() => {
		fileListVisible.set(false, undefined);
		widget.setViewModel(undefined);
	}));
	composite.layout(new Dimension(width, height));
	await viewModel.waitForDiffOr1s();
	if (structuralChanges) {
		// Expands greet.ts like a click on its twistie does
		const greet = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].find(row => row.querySelector('.label-name')?.textContent === 'greet.ts');
		greet?.querySelector('.monaco-tl-twistie')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await waitForFixtureDomCondition(container, () => container.querySelectorAll('.scm-structural-change').length === 2, disposableStore);
	}
}

const greetOriginalText = `export function greet(name: string): string {
	return 'Hello, ' + name;
}

export function main() {
	console.log(greet('World'));
}
`;

const greetModifiedText = `export function greet(name: string, greeting = 'Hello'): string {
	return \`\${greeting}, \${name}!\`;
}

export function farewell(name: string): string {
	return \`Goodbye, \${name}!\`;
}

export function main() {
	console.log(greet('World'));
}
`;

/** Finds the exported functions of a document, each of which ends at the next line that closes a block. */
function findFunctions(model: ITextModel): Map<string, StructuralDiffItem> {
	const functions = new Map<string, StructuralDiffItem>();
	for (let line = 1; line <= model.getLineCount(); line++) {
		const name = /^export function (?<name>\w+)/.exec(model.getLineContent(line))?.groups?.name;
		if (name) {
			let end = line;
			while (end < model.getLineCount() && model.getLineContent(end) !== '}') {
				end++;
			}
			const column = 'export function '.length + 1;
			functions.set(name, { name, kind: SymbolKind.Function, range: new Range(line, 1, end, model.getLineMaxColumn(end)), selectionRange: new Range(line, column, line, column + name.length) });
		}
	}
	return functions;
}

type Side = 'original' | 'modified';

interface IFixtureStructuralDiffNode {
	readonly id: string;
	readonly items: Record<Side, StructuralDiffItem | undefined>;
	readonly changes: Record<Side, StructuralDiffCoverage[]>;
}

/**
 * Lists the functions that changed in a file in document order. Each text change belongs to the function that contains
 * it, as a change of its declaration if it starts on its first line, or else to the file.
 */
class FixtureStructuralDiffProvider implements StructuralDiffProvider {
	provideStructuralDiff(original: ITextModel, modified: ITextModel, context: StructuralDiffContext): StructuralDiff {
		const sides: readonly Side[] = ['original', 'modified'];
		const changedRange = (index: number, side: Side) => side === 'original' ? context.changes[index].originalRange : context.changes[index].modifiedRange;
		const createNode = (id: string, items: Record<Side, StructuralDiffItem | undefined>): IFixtureStructuralDiffNode => ({ id, items, changes: { original: [], modified: [] } });
		const file = (model: ITextModel): StructuralDiffItem => ({ name: basename(model.uri), kind: SymbolKind.File, range: model.getFullModelRange() });
		const root = createNode('file', { original: file(original), modified: file(modified) });
		const functions = { original: findFunctions(original), modified: findFunctions(modified) };
		const nodes = [...new Set([...functions.modified.keys(), ...functions.original.keys()])]
			.map(name => createNode(name, { original: functions.original.get(name), modified: functions.modified.get(name) }));
		const contains = (node: IFixtureStructuralDiffNode, side: Side, range: IRange, intersects = false) => {
			const item = node.items[side];
			return !!item && (intersects ? Range.areIntersecting(item.range, range) : Range.containsRange(item.range, range));
		};

		for (let textChangeIndex = 0; textChangeIndex < context.changes.length; textChangeIndex++) {
			for (const side of sides) {
				const range = changedRange(textChangeIndex, side);
				if (!Range.isEmpty(range)) {
					const owner = nodes.find(node => contains(node, side, range));
					const declaration = owner?.items[side]?.range.startLineNumber === range.startLineNumber;
					(owner ?? root).changes[side].push({ textChangeIndex, range, classification: declaration ? StructuralDiffClassification.Header : StructuralDiffClassification.Implementation });
				}
			}
		}

		const toStructuralDiffNode = (node: IFixtureStructuralDiffNode, children: StructuralDiffNode[]): StructuralDiffNode => ({
			id: node.id, originalItem: node.items.original, modifiedItem: node.items.modified, originalChanges: node.changes.original, modifiedChanges: node.changes.modified, children,
		});
		// Functions without changed text are omitted
		const changed = nodes.filter(node => sides.some(side => context.changes.some((_, index) => contains(node, side, changedRange(index, side), true))));
		return { root: toStructuralDiffNode(root, changed.map(node => toStructuralDiffNode(node, []))), isIncomplete: false };
	}
}

export default defineThemedFixtureGroup({ path: 'editor/multiDiffEditor' }, {
	withFileList: defineThemedFixtureGroup({
		WithFileList: defineComponentFixture({
			themes: ['dark', 'light'],
			additionalThemes: ['darkHighContrast', 'lightHighContrast'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['Multi-file diffs on the left and a list of the five changed files docked on the right, with modified, added, deleted and renamed status letters; the first file is selected.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 1000 }),
		}),
		WithFileListTree: defineComponentFixture({
			themes: ['dark', 'light'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['The same five changed files shown as a tree: a "src" folder with "server", "legacy" and "common" subfolders, and a "test" folder; files keep their status letters and hide their folder paths.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 1000, viewMode: 'tree' }),
		}),
		WithFileListOnLeft: defineComponentFixture({
			themes: ['dark', 'light'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['A list of five changed files docked on the left of the multi-file diffs, with the first file selected.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 1000, position: 'left' }),
		}),
		NarrowKeepsFileList: defineComponentFixture({
			themes: ['dark'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['A narrow multi diff editor that keeps the list of changed files docked on the right at its minimum width, with the diffs using the remaining width.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 520 }),
		}),
		WithStructuralChanges: defineComponentFixture({
			themes: ['dark', 'light'],
			additionalThemes: ['darkHighContrast', 'lightHighContrast'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['The list of changed files on the right of the multi-file diffs, with greet.ts expanded to the functions that changed in it: greet, with a muted decl+impl annotation before an M status letter, and the added farewell, with an A status letter. Their function icons are indented under the file icon, and their status letters line up with those of the files. greet.ts and the other TypeScript files that both diff sides have show a chevron directly followed by their file icon, like folders in the Explorer; all files keep the space of a twistie, so that their icons align.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 1000, structuralChanges: true }),
		}),
		WithStructuralChangesTree: defineComponentFixture({
			themes: ['dark', 'light'],
			labels: { kind: 'screenshot' },
			expectedVisualDescriptions: ['The changed files as a tree of folders, with greet.ts in the "server" folder expanded to its changed greet and farewell functions, whose icons are indented under the file icon. Like file nests in the Explorer, the files that can expand show a chevron directly followed by their file icon, while the icons of the other files take the place of their twisties.'],
			render: context => renderMultiDiffEditorWithFileListWidget(context, { width: 1000, viewMode: 'tree', structuralChanges: true }),
		}),
	}),
});
