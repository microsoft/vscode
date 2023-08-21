/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMappedEditsService, MappedEditsContext } from 'vs/workbench/services/mappedEdits/common/mappedEdits';

CommandsRegistry.registerCommand('_executeMappedEditsProvider', async (accessor: ServicesAccessor, documentUri: URI, codeBlocks: string[], context: MappedEditsContext) => {

	const mappedEditsService = accessor.get(IMappedEditsService);
	const modelService = accessor.get(ITextModelService);

	const document = await modelService.createModelReference(documentUri);

	const cancellationTokenSource = new CancellationTokenSource();

	const result = await mappedEditsService.provideMappedEdits(document.object.textEditorModel, codeBlocks, context, cancellationTokenSource.token);

	document.dispose();

	return result;
});
