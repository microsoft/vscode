/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import * as resourceUtils from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { UnthemedProductIconTheme } from '../../../../../platform/theme/browser/iconsStyleSheet.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import '../../../../contrib/scm/browser/media/scm.css';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

interface SCMDecorationFixture {
	readonly resource: URI;
	readonly fileKind: FileKind;
}

const modifiedResource = URI.file('/workspace/modified.ts');
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

const fixtureDecorations = new Map<string, IDecorationData>([
	[modifiedResource.toString(), { letter: 'M', tooltip: 'Modified', color: 'gitDecoration.modifiedResourceForeground' }],
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
		render: renderResourceDecorations,
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
}

function renderResourceDecorations({ container, disposableStore, theme, fileIconTheme }: ComponentFixtureContext): void {
	container.classList.add('scm-view');
	container.style.width = '280px';
	container.style.padding = 'var(--vscode-spacing-size120)';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-fontSize-body1)';
	container.style.setProperty('--vscode-gitDecoration-modifiedResourceForeground', 'var(--vscode-editorWarning-foreground)');
	container.style.setProperty('--vscode-gitDecoration-untrackedResourceForeground', 'var(--vscode-charts-green)');
	container.style.setProperty('--vscode-gitDecoration-deletedResourceForeground', 'var(--vscode-editorError-foreground)');
	container.style.setProperty('--vscode-gitDecoration-renamedResourceForeground', 'var(--vscode-charts-yellow)');

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
	const list = append(container, $('.monaco-list'));

	for (const fixtureResource of fixtureResources) {
		const row = append(list, $('.monaco-list-row'));
		row.style.position = 'relative';
		row.style.height = '22px';

		const resource = append(row, $('.resource'));
		const name = append(resource, $('.name'));
		const label = resourceLabels.create(name);
		label.setFile(fixtureResource.resource, {
			fileKind: fixtureResource.fileKind,
			fileDecorations: { colors: false, badges: true },
			hidePath: true,
		});
	}
}
