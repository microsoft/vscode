/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import * as resourceUtils from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { StructuralDiffClassification, SymbolKind } from '../../../../../editor/common/languages.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { UnthemedProductIconTheme } from '../../../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import '../../../../contrib/scm/browser/media/scm.css';
import { SCMStructuralDiffRenderer } from '../../../../contrib/scm/browser/scmStructuralDiffRenderer.js';
import { ISCMResource } from '../../../../contrib/scm/common/scm.js';
import { SCMStructuralDiffElement, SCMStructuralDiffNode } from '../../../../contrib/scm/common/scmStructuralDiff.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { setGitDecorationColors } from './scmFixtureUtils.js';

interface SCMDecorationFixture {
	readonly resource: URI;
	readonly fileKind: FileKind;
	readonly structuralChange?: 'modified' | 'added' | 'deleted' | 'renamed';
}

const modifiedResource = URI.file('/workspace/modified.ts');
const diagnosticsResource = URI.file('/workspace/modified-with-problems.ts');
const addedResource = URI.file('/workspace/added.ts');
const untrackedResource = URI.file('/workspace/untracked.ts');
const deletedResource = URI.file('/workspace/deleted.ts');
const renamedResource = URI.file('/workspace/renamed.ts');
const readOnlyResource = URI.file('/workspace/read-only.ts');
const bubbledParentResource = URI.file('/workspace/contains-changes');
const bubbledChildResource = URI.file('/workspace/contains-changes/modified.ts');

const fixtureResources: readonly SCMDecorationFixture[] = [
	{ resource: modifiedResource, fileKind: FileKind.FILE },
	{ resource: untrackedResource, fileKind: FileKind.FILE },
	{ resource: deletedResource, fileKind: FileKind.FILE },
	{ resource: renamedResource, fileKind: FileKind.FILE },
	{ resource: readOnlyResource, fileKind: FileKind.FILE },
	{ resource: bubbledParentResource, fileKind: FileKind.FOLDER },
];

const mixedFixtureResources: readonly SCMDecorationFixture[] = [
	{ resource: modifiedResource, fileKind: FileKind.FILE, structuralChange: 'modified' },
	{ resource: diagnosticsResource, fileKind: FileKind.FILE, structuralChange: 'modified' },
	{ resource: addedResource, fileKind: FileKind.FILE, structuralChange: 'added' },
	{ resource: deletedResource, fileKind: FileKind.FILE, structuralChange: 'deleted' },
	{ resource: renamedResource, fileKind: FileKind.FILE, structuralChange: 'renamed' },
];

const fixtureDecorations = new Map<string, IDecorationData>([
	[modifiedResource.toString(), { letter: 'M', tooltip: 'Modified', color: 'gitDecoration.modifiedResourceForeground' }],
	[diagnosticsResource.toString(), { letter: 'M', tooltip: 'Modified', color: 'gitDecoration.modifiedResourceForeground' }],
	[addedResource.toString(), { letter: 'A', tooltip: 'Added', color: 'gitDecoration.addedResourceForeground' }],
	[untrackedResource.toString(), { letter: 'U', tooltip: 'Untracked', color: 'gitDecoration.untrackedResourceForeground' }],
	[deletedResource.toString(), { letter: 'D', tooltip: 'Deleted', color: 'gitDecoration.deletedResourceForeground', strikethrough: true }],
	[renamedResource.toString(), { letter: 'R', tooltip: 'Renamed', color: 'gitDecoration.renamedResourceForeground' }],
	[readOnlyResource.toString(), { letter: Codicon.lockSmall, tooltip: 'Read-only', color: 'gitDecoration.deletedResourceForeground' }],
	[bubbledChildResource.toString(), { letter: 'M', tooltip: 'Modified child', color: 'gitDecoration.modifiedResourceForeground', bubble: true }],
]);

export default defineThemedFixtureGroup({ path: 'scm/' }, {
	ResourceDecorations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Six Source Control resource rows show modified, untracked, deleted, renamed, read-only, and contains-changes states. The M, U, D, and R text decorations use the same text size, each is centered in an equal-width box, and their centers form one vertical column. The deleted filename is struck through and each decoration retains its Git theme color. The read-only lock and bubbled-child glyph retain their existing icon size and weight instead of using the text-badge typography.',
		],
		render: context => renderResourceDecorations(context, fixtureResources, 280),
	}),
	ResourceAndStructuralDecorations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Five file rows each have an indented structural child. Single M, A, D, and R status letters on file and structural rows use the same text size and dimmed opacity, each is centered in an equal-width box, and their centers form one vertical column. The wider 5, M diagnostic badge ends at the same right edge and extends to the left, so its M sits slightly right of that column. Implementation annotations stay before the M on structural rows, while renames have R without an annotation. Filenames, symbol icons, and theme colors are preserved.',
		],
		render: context => renderResourceDecorations(context, mixedFixtureResources, 360),
	}),
	ResourceAndStructuralDecorationsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'A narrow Source Control list shows files and indented structural children. Single M, A, D, and R status letters remain fully visible, each centered in an equal-width box, and their centers form one vertical column. The 5, M diagnostic badge retains its count, ends at the same right edge, and extends to the left. Long file and symbol names truncate with ellipses before the annotations and badges.',
		],
		render: context => renderResourceDecorations(context, mixedFixtureResources, 220),
	}),
});

function registerFixtureDecorations(decorationsService: IDecorationsService, disposableStore: DisposableStore): void {
	const provider: IDecorationsProvider = {
		label: 'SCM Resource Decorations Fixture',
		onDidChange: Event.None,
		provideDecorations(resource: URI, _token: CancellationToken): IDecorationData | undefined {
			return fixtureDecorations.get(resource.toString());
		},
	};
	disposableStore.add(decorationsService.registerDecorationsProvider(provider));
	disposableStore.add(decorationsService.registerDecorationsProvider({
		label: 'SCM Fixture Problems',
		onDidChange: Event.None,
		provideDecorations: resource => resourceUtils.isEqual(resource, diagnosticsResource)
			? { letter: '5', tooltip: '5 Problems', weight: 10, color: 'editorError.foreground' }
			: undefined,
	}));
}

function renderResourceDecorations({ container, disposableStore, theme, fileIconTheme }: ComponentFixtureContext, resources: readonly SCMDecorationFixture[], width: number): void {
	container.classList.add('scm-view');
	container.style.width = `${width}px`;
	container.style.padding = 'var(--vscode-spacing-size120)';
	container.style.fontSize = 'var(--vscode-fontSize-body1)';
	setGitDecorationColors(container);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IThemeService, new TestThemeService(theme, fileIconTheme, new UnthemedProductIconTheme()));
			registration.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override extUri = resourceUtils.extUri;
			}());
			registration.defineInstance(ITextFileService, new class extends mock<ITextFileService>() {
				override readonly untitled = new class extends mock<ITextFileService['untitled']>() {
					override readonly onDidChangeLabel = Event.None;
				}();
			}());
			registration.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() {
				override getNotebook() { return undefined; }
			}());
		},
	});

	const decorationsService = disposableStore.add(instantiationService.createInstance(DecorationsService));
	instantiationService.stub(IDecorationsService, decorationsService);
	registerFixtureDecorations(decorationsService, disposableStore);
	decorationsService.getDecoration(bubbledChildResource, false)?.dispose();

	const resourceLabels = disposableStore.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
	const structuralRenderer = instantiationService.createInstance(SCMStructuralDiffRenderer);
	const list = append(container, $('.monaco-list'));
	// Structural children need tree rows for indentation; plain resource lists keep flat list rows.
	const treeRows = resources.some(resource => resource.structuralChange);
	const createRow = (nested: boolean) => {
		const row = append(list, $('.monaco-list-row'));
		row.style.position = 'relative';
		row.style.height = '22px';
		if (!treeRows) {
			return row;
		}
		const contents = append(row, $('.monaco-tl-contents'));
		contents.style.paddingLeft = nested ? 'var(--vscode-spacing-size160)' : '';
		return contents;
	};
	for (const fixtureResource of resources) {
		const resource = append(createRow(false), $('.resource'));
		const name = append(resource, $('.name'));
		const label = resourceLabels.create(name);
		label.setFile(fixtureResource.resource, {
			fileKind: fixtureResource.fileKind,
			fileDecorations: { colors: false, badges: true },
			hidePath: true,
		});
		if (fixtureResource.structuralChange) {
			const scmResource = new class extends mock<ISCMResource>() {
				override readonly sourceUri = fixtureResource.resource;
			};
			const range = new Range(1, 1, 3, 1);
			const item = { name: 'calculateWithValidation', kind: SymbolKind.Method, range };
			const element: SCMStructuralDiffNode = {
				type: 'structuralDiff', id: fixtureResource.resource.toString(), generation: 1, order: 0, resource: scmResource, parent: scmResource, children: [],
				node: {
					id: 'method',
					originalItem: fixtureResource.structuralChange === 'added' ? undefined
						: fixtureResource.structuralChange === 'renamed' ? { ...item, name: 'calculate' } : item,
					modifiedItem: fixtureResource.structuralChange === 'deleted' ? undefined : item,
					originalChanges: [],
					modifiedChanges: fixtureResource.structuralChange === 'modified'
						? [{ textChangeIndex: 0, range, classification: StructuralDiffClassification.Implementation }] : [],
					children: [],
				},
			};
			const template = disposableStore.add(structuralRenderer.renderTemplate(createRow(true)));
			structuralRenderer.renderElement(new class extends mock<ITreeNode<SCMStructuralDiffElement, FuzzyScore>>() {
				override readonly element = element;
				override readonly filterData = FuzzyScore.Default;
			}, 0, template);
		}
	}
}
