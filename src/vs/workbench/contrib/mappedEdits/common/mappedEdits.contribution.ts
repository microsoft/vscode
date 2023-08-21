/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMappedEditsService, MappedEditsContext } from 'vs/workbench/services/mappedEdits/common/mappedEdits';

class ExecuteMappedEditsProvider extends Action2 {

	static readonly ID = '_executeMappedEditsProvider';

	constructor() {
		super({
			id: ExecuteMappedEditsProvider.ID,
			title: { value: nls.localize('executeMappedEditsProvider', "Execute Mapped Edits Provider"), original: '' },
			f1: false,
			description: {
				description: nls.localize('executeMappedEditsProvider.description', "Executes Mapped Edits Provider and returns the corresponding WorkspaceEdit or null if no edits are provided."),
				args: [
					// FIXME@ulugbekna
				]
			}
		});
	}

	async run(accessor: ServicesAccessor, documentUri: URI, codeBlocks: string[], context: MappedEditsContext) {

		const mappedEditsService = accessor.get(IMappedEditsService);
		const modelService = accessor.get(ITextModelService);

		const document = await modelService.createModelReference(documentUri);

		const cancellationTokenSource = new CancellationTokenSource();

		const res = await mappedEditsService.provideMappedEdits(document.object.textEditorModel, codeBlocks, context, cancellationTokenSource.token);

		document.dispose();

		return res;
	}
}

registerAction2(ExecuteMappedEditsProvider);
