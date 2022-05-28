/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { createStringDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { toVSDataTransfer } from 'vs/editor/browser/dnd';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { DocumentOnDropEditProvider, SnippetTextEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { performSnippetEdit } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { extractEditorsDropData } from 'vs/platform/dnd/browser/dnd';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';


export class DropIntoEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.dropIntoEditorController';

	constructor(
		editor: ICodeEditor,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(editor.onDropIntoEditor(e => this.onDropIntoEditor(editor, e.position, e.event)));


		this._languageFeaturesService.documentOnDropEditProvider.register('*', new DefaultOnDropProvider(workspaceContextService));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.experimental.editor.dropIntoEditor.enabled')) {
				this.updateEditorOptions(editor);
			}
		}));

		this.updateEditorOptions(editor);
	}

	private updateEditorOptions(editor: ICodeEditor) {
		editor.updateOptions({
			enableDropIntoEditor: this._configurationService.getValue('workbench.experimental.editor.dropIntoEditor.enabled')
		});
	}

	private async onDropIntoEditor(editor: ICodeEditor, position: IPosition, dragEvent: DragEvent) {
		if (!dragEvent.dataTransfer || !editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const modelVersionNow = model.getVersionId();

		const ourDataTransfer = await this.extractDataTransferData(dragEvent);
		if (ourDataTransfer.size === 0) {
			return;
		}

		if (editor.getModel().getVersionId() !== modelVersionNow) {
			return;
		}

		const cts = new CancellationTokenSource();
		editor.onDidDispose(() => cts.cancel());
		model.onDidChangeContent(() => cts.cancel());

		const providers = this._languageFeaturesService.documentOnDropEditProvider.ordered(model);
		for (const provider of providers) {
			const edit = await provider.provideDocumentOnDropEdits(model, position, ourDataTransfer, cts.token);
			if (cts.token.isCancellationRequested || editor.getModel().getVersionId() !== modelVersionNow) {
				return;
			}

			if (edit) {
				performSnippetEdit(editor, edit);
				return;
			}
		}
	}

	public async extractDataTransferData(dragEvent: DragEvent): Promise<VSDataTransfer> {
		if (!dragEvent.dataTransfer) {
			return new VSDataTransfer();
		}

		const textEditorDataTransfer = toVSDataTransfer(dragEvent.dataTransfer);
		if (!textEditorDataTransfer.has(Mimes.uriList)) {
			const editorData = (await this._instantiationService.invokeFunction(extractEditorsDropData, dragEvent))
				.filter(input => input.resource)
				.map(input => input.resource!.toString());

			if (editorData.length) {
				const str = distinct(editorData).join('\n');
				textEditorDataTransfer.replace(Mimes.uriList, createStringDataTransferItem(str));
			}
		}

		return textEditorDataTransfer;
	}
}

class DefaultOnDropProvider implements DocumentOnDropEditProvider {

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	async provideDocumentOnDropEdits(model: ITextModel, position: IPosition, dataTransfer: VSDataTransfer, _token: CancellationToken): Promise<SnippetTextEdit | undefined> {
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);

		const urlListEntry = dataTransfer.get('text/uri-list');
		if (urlListEntry) {
			const urlList = await urlListEntry.asString();
			return this.doUriListDrop(range, urlList);
		}

		const textEntry = dataTransfer.get('text') ?? dataTransfer.get(Mimes.text);
		if (textEntry) {
			const text = await textEntry.asString();
			return { range, snippet: text };
		}
		return undefined;
	}

	private doUriListDrop(range: Range, urlList: string): SnippetTextEdit | undefined {
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

		return { range, snippet };
	}
}


registerEditorContribution(DropIntoEditorController.ID, DropIntoEditorController);

