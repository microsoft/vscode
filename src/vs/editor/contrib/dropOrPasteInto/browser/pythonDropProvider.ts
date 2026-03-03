/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IReadonlyVSDataTransfer, UriList } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IPosition } from '../../../common/core/position.js';
import { DocumentDropEditProvider, DocumentDropEditsSession } from '../../../common/languages.js';
import { ITextModel } from '../../../common/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';

class PythonFileReadDropProvider implements DocumentDropEditProvider {

	readonly kind = HierarchicalKind.Empty.append('uri', 'python', 'openRead');
	readonly providedDropEditKinds = [this.kind];
	readonly dropMimeTypes = [Mimes.uriList];

	constructor(
		private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	async provideDocumentDropEdits(model: ITextModel, _position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<DocumentDropEditsSession | undefined> {
		const urlListEntry = dataTransfer.get(Mimes.uriList);
		if (!urlListEntry) {
			return;
		}

		const strUriList = await urlListEntry.asString();
		if (token.isCancellationRequested) {
			return;
		}

		const fileEntries: { uri: URI; path: string }[] = [];
		for (const entry of UriList.parse(strUriList)) {
			try {
				const uri = URI.parse(entry);
				if (uri.scheme === Schemas.file) {
					const root = this._workspaceContextService.getWorkspaceFolder(uri);
					const relPath = root ? relativePath(root.uri, uri) : undefined;
					fileEntries.push({ uri, path: relPath ?? uri.fsPath });
				}
			} catch {
				// noop
			}
		}

		if (!fileEntries.length) {
			return;
		}

		const text = model.getValue();
		const usedNumbers = new Set<number>();
		const re = /\bstr(\d+)\b/g;
		let match;
		while ((match = re.exec(text)) !== null) {
			usedNumbers.add(parseInt(match[1], 10));
		}

		const lines: string[] = [];
		for (const { path } of fileEntries) {
			let n = 1;
			while (usedNumbers.has(n)) {
				n++;
			}
			usedNumbers.add(n);
			lines.push(`str${n} = open("${path}").read()`);
		}

		return {
			edits: [{
				insertText: lines.join('\n') + '\n',
				title: fileEntries.length > 1 ? 'Insert as Python open().read() calls' : 'Insert as Python open().read()',
				kind: this.kind,
				handledMimeType: Mimes.uriList,
			}],
			dispose() { },
		};
	}
}

export class PythonDropProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._register(languageFeaturesService.documentDropEditProvider.register({ language: 'python' }, new PythonFileReadDropProvider(workspaceContextService)));
	}
}
