/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IDataTransfer, IDataTransferItem } from 'vs/editor/common/dnd';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { extractEditorsDropData } from 'vs/workbench/browser/dnd';


export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	constructor(
		editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event));
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const modelVersionNow = model.getVersionId();

		const textEditorDataTransfer: IDataTransfer = new Map<string, IDataTransferItem>();
		for (const item of dragEvent.dataTransfer.items) {
			const type = item.type;
			if (item.kind === 'string') {
				const asStringValue = new Promise<string>(resolve => item.getAsString(resolve));
				textEditorDataTransfer.set(type, {
					asString: () => asStringValue,
					asFile: () => undefined,
					value: undefined
				});
			} else if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file) {
					textEditorDataTransfer.set(type, {
						asString: () => Promise.resolve(''),
						asFile: () => {
							const uri = file.path ? URI.parse(file.path) : undefined;
							return {
								name: file.name,
								uri: uri,
								data: async () => {
									return new Uint8Array(await file.arrayBuffer());
								},
							};
						},
						value: undefined
					});
				}
			}
		}

		if (!textEditorDataTransfer.has(Mimes.uriList.toLowerCase())) {
			const editorData = (await this._instantiationService.invokeFunction(extractEditorsDropData, dragEvent))
				.filter(input => input.resource)
				.map(input => input.resource!.toString());

			if (editorData.length) {
				const str = distinct(editorData).join('\n');
				textEditorDataTransfer.set(Mimes.uriList.toLowerCase(), {
					asString: () => Promise.resolve(str),
					asFile: () => undefined,
					value: undefined
				});
			}
		}

		if (textEditorDataTransfer.size === 0) {
			return;
		}

		if (editor.getModel().getVersionId() !== modelVersionNow) {
			return;
		}

		const cts = new CancellationTokenSource();
		editor.onDidDispose(() => cts.cancel());
		model.onDidChangeContent(() => cts.cancel());

		const ordered = this._languageFeaturesService.documentOnDropEditProvider.ordered(model);
		for (const provider of ordered) {
			const edit = await provider.provideDocumentOnDropEdits(model, position, textEditorDataTransfer, cts.token);
			if (cts.token.isCancellationRequested || editor.getModel().getVersionId() !== modelVersionNow) {
				return;
			}

			if (edit) {
				performSnippetEdit(editor, edit);
				return;
			}
		}

		return this.doDefaultDrop(editor, position, textEditorDataTransfer, cts.token);
	}

	private async doDefaultDrop(editor: ICodeEditor, position: IPosition, textEditorDataTransfer: IDataTransfer, token: CancellationToken): Promise<void> {
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);

		const urlListEntry = textEditorDataTransfer.get('text/uri-list');
		if (urlListEntry) {
			const urlList = await urlListEntry.asString();
			return this.doUriListDrop(editor, range, urlList, token);
		}

		const textEntry = textEditorDataTransfer.get('text') ?? textEditorDataTransfer.get(Mimes.text);
		if (textEntry) {
			const text = await textEntry.asString();
			performSnippetEdit(editor, { range, snippet: text });
		}
	}

	private async doUriListDrop(editor: ICodeEditor, range: Range, urlList: string, token: CancellationToken): Promise<void> {
		const uris: URI[] = [];
		for (const resource of urlList.split('\n')) {
			try {
				uris.push(URI.parse(resource));
			} catch {
				// noop
			}
		}

		if (!uris.length) {
			return;
		}

		const snippet = uris
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

		performSnippetEdit(editor, { range, snippet });
	}
}


registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController);
