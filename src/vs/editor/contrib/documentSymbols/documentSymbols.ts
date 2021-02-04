/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentSymbol } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { assertType } from 'vs/base/common/types';

export async function getDocumentSymbols(document: ITextModel, flat: boolean, token: CancellationToken): Promise<DocumentSymbol[]> {
	const model = await OutlineModel.create(document, token);
	return flat
		? model.asListOfDocumentSymbols()
		: model.getTopLevelSymbols();
}

CommandsRegistry.registerCommand('_executeDocumentSymbolProvider', async function (accessor, ...args) {
	const [resource] = args;
	assertType(URI.isUri(resource));

	const model = accessor.get(IModelService).getModel(resource);
	if (model) {
		return getDocumentSymbols(model, false, CancellationToken.None);
	}

	const reference = await accessor.get(ITextModelService).createModelReference(resource);
	try {
		return await getDocumentSymbols(reference.object.textEditorModel, false, CancellationToken.None);
	} finally {
		reference.dispose();
	}
});
