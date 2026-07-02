/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { INotebookDocumentService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionFile, SessionFileOperation } from '../../../../services/sessions/common/session.js';
import { ISessionFilesInput, SessionFilesWidget } from '../../browser/sessionFilesWidget.js';

// Ensure color registrations are loaded
import '../../../../common/theme.js';

const SAMPLE_FILES: readonly ISessionFile[] = [
	{ uri: URI.file('/home/user/.bashrc'), operation: SessionFileOperation.Modified, originalUri: URI.file('/home/user/.bashrc.orig') },
	{ uri: URI.file('/home/user/.config/app/settings.json'), operation: SessionFileOperation.Created },
	{ uri: URI.file('/home/user/.cache/tmp/scratch.log'), operation: SessionFileOperation.Deleted },
	{ uri: URI.file('/tmp/agent-notes.md'), operation: SessionFileOperation.Created },
];

function renderWidget(ctx: ComponentFixtureContext, options?: { files?: readonly ISessionFile[]; height?: number }): void {
	ctx.container.style.width = '360px';
	ctx.container.style.height = `${options?.height ?? 160}px`;
	ctx.container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			// Services required by ResourceLabels (file labels in the list).
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.definePartialInstance(INotebookDocumentService, { getNotebook: () => undefined });
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override async readFile(resource: URI): Promise<IFileContent> {
					return new class extends mock<IFileContent>() {
						override readonly resource = resource;
						override readonly value = VSBuffer.fromString('original content');
					}();
				}
			}());
			// Required by WorkbenchList (the files list).
			reg.define(IListService, ListService);
			registerWorkbenchServices(reg);
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
				override readonly onDidVisibleEditorsChange = Event.None;
				override readonly onDidEditorsChange = Event.None;
				override async openEditor(): Promise<undefined> { return undefined; }
			}());
		},
	});

	const files = options?.files ?? SAMPLE_FILES;
	const input: ISessionFilesInput = {
		sessionFilesObs: observableValue<readonly ISessionFile[]>('fixtureSessionFiles', files),
	};

	const widget = ctx.disposableStore.add(instantiationService.createInstance(SessionFilesWidget, ctx.container));
	ctx.disposableStore.add(widget.setInput(input));

	// The widget normally lives inside a SplitView pane that drives its layout;
	// the fixture sizes it directly so the list renders.
	const totalHeight = options?.height ?? 160;
	widget.element.style.height = `${totalHeight}px`;
	widget.layout(Math.max(0, totalHeight - SessionFilesWidget.HEADER_HEIGHT));
}

export default defineThemedFixtureGroup({ path: 'changes/' }, {

	WithFiles: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx),
	}),

	SingleCreatedFile: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, {
			files: [{ uri: URI.file('/home/user/.gitconfig'), operation: SessionFileOperation.Created }],
			height: 96,
		}),
	}),

	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderWidget(ctx, { files: [], height: 96 }),
	}),

});
