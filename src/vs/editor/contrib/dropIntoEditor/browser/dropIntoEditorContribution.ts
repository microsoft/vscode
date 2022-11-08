/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { addExternalEditorsDropData, toVSDataTransfer, UriList } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentOnDropEdit, DocumentOnDropEditProvider, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { localize } from 'vs/nls';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';


export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	constructor(
		editor: ICodeEditor,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IProgressService private readonly _progressService: IProgressService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event)));

		this._languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultOnDropProvider(workspaceContextService));
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const initialModelVersion = model.getVersionId();

		const ourDataTransfer = await this.extractDataTransferData(dragEvent);
		if (ourDataTransfer.size === 0) {
			return;
		}

		if (editor.getModel().getVersionId() !== initialModelVersion) {
			return;
		}

		const tokenSource = new EditorStateCancellationTokenSource(editor, CodeEditorStateFlag.Value);
		try {
			const providers = this._languageFeaturesService.documentOnDropEditProvider.ordered(model);

			const providerEdit = await this._progressService.withProgress({
				location: ProgressLocation.Notification,
				delay: 750,
				title: localize('dropProgressTitle', "Running drop handlers..."),
				cancellable: true,
			}, () => {
				return raceCancellation((async () => {
					for (const provider of providers) {
						const edit = await provider.provideDocumentOnDropEdits(model, position, ourDataTransfer, tokenSource.token);
						if (tokenSource.token.isCancellationRequested) {
							return undefined;
						}
						if (edit) {
							return edit;
						}
					}
					return undefined;
				})(), tokenSource.token);
			}, () => {
				tokenSource.cancel();
			});

			if (tokenSource.token.isCancellationRequested || editor.getModel().getVersionId() !== initialModelVersion) {
				return;
			}

			if (providerEdit) {
				const snippet = typeof providerEdit.insertText === 'string' ? SnippetParser.escape(providerEdit.insertText) : providerEdit.insertText.snippet;
				const combinedWorkspaceEdit: WorkspaceEdit = {
					edits: [
						new ResourceTextEdit(model.uri, {
							range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
							text: snippet,
							insertAsSnippet: true,
						}),
						...(providerEdit.additionalEdit?.edits ?? [])
					]
				};
				await this._bulkEditService.apply(combinedWorkspaceEdit, { editor });
				return;
			}
		} finally {
			tokenSource.dispose();
		}
	}

	public async extractDataTransferData(dragEvent: DragEvent): Promise<VSDataTransfer> {
		if (!dragEvent.dataTransfer) {
			return new VSDataTransfer();
		}

		const textEditorDataTransfer = toVSDataTransfer(dragEvent.dataTransfer);
		addExternalEditorsDropData(textEditorDataTransfer, dragEvent);
		return textEditorDataTransfer;
	}
}

class DefaultOnDropProvider implements DocumentOnDropEditProvider {

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	async provideDocumentOnDropEdits(_model: ITextModel, _position: IPosition, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<DocumentOnDropEdit | undefined> {
		const urlListEntry = dataTransfer.get(Mimes.uriList);
		if (urlListEntry) {
			const urlList = await urlListEntry.asString();
			const snippet = this.getUriListInsertText(urlList);
			if (snippet) {
				return { insertText: snippet };
			}
		}

		const textEntry = dataTransfer.get('text') ?? dataTransfer.get(Mimes.text);
		if (textEntry) {
			const text = await textEntry.asString();
			return { insertText: text };
		}

		return undefined;
	}

	private getUriListInsertText(strUriList: string): string | undefined {
		const uris: URI[] = [];
		for (const resource of UriList.parse(strUriList)) {
			try {
				uris.push(URI.parse(resource));
			} catch {
				// noop
			}
		}

		if (!uris.length) {
			return;
		}

		return uris
			.map(uri => {
				const root = this._workspaceContextService.getWorkspaceFolder(uri);
				if (root) {
					const rel = relativePath(root.uri, uri);
					if (rel) {
						return rel;
					}
				}
				return uri.fsPath;
			})
			.join(' ');
	}
}


registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController);

