/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IOutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

CommandsRegistry.registerCommand('_executeDocumentSymbolProvider', async function (accessor, ...args) {
	const [resource] = args;
	assertType(URI.isUri(resource));

	const outlineService = accessor.get(IOutlineModelService);
	const modelService = accessor.get(ITextModelService);

	const reference = await modelService.createModelReference(resource);
	try {
		return (await outlineService.getOrCreate(reference.object.textEditorModel, CancellationToken.None)).getTopLevelSymbols();
	} finally {
		reference.dispose();
	}
});
