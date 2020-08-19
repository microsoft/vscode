/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isEqualOrParent } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { formatDocumentRangesWithSelectedProvider, FormattingMode } from 'vs/editor/contrib/format/format';
import * as nls from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ISCMProvider, ISCMService } from 'vs/workbench/contrib/scm/common/scm';

registerEditorAction(class FormatChangedLinesAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatChanges',
			label: nls.localize('formatChanges', "Format Changed Lines"),
			alias: 'Format Document...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasDocumentSelectionFormattingProvider),
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const scmService = accessor.get(ISCMService);
		const workerService = accessor.get(IEditorWorkerService);
		const modelService = accessor.get(ITextModelService);
		const instaService = accessor.get(IInstantiationService);

		if (!editor.hasModel()) {
			return;
		}

		const modified = editor.getModel().uri;
		const provider = this._getBestProvider(scmService, modified);
		if (!provider) {
			return;
		}

		const original = await provider.getOriginalResource(modified);
		if (!original) {
			return;
		}

		const ranges: Range[] = [];
		const ref = await modelService.createModelReference(original);
		try {
			if (workerService.canComputeDirtyDiff(original, modified)) {
				const changes = await workerService.computeDirtyDiff(original, modified, true);
				if (isNonEmptyArray(changes)) {
					for (let change of changes) {
						ranges.push(editor.getModel().validateRange(new Range(
							change.modifiedStartLineNumber, 1,
							change.modifiedEndLineNumber || change.modifiedStartLineNumber /*endLineNumber is 0 when things got deleted*/, Number.MAX_SAFE_INTEGER)
						));
					}
				}
			}
		} finally {
			ref.dispose();
		}

		if (ranges.length > 0) {
			return instaService.invokeFunction(
				formatDocumentRangesWithSelectedProvider, editor, ranges,
				FormattingMode.Explicit, CancellationToken.None
			);
		}
	}

	private _getBestProvider(scmService: ISCMService, uri: URI): ISCMProvider | undefined {
		for (let repo of scmService.repositories) {
			if (repo.provider.rootUri && isEqualOrParent(uri, repo.provider.rootUri)) {
				return repo.provider;
			}
		}
		return undefined;
	}
});
