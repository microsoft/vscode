/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import * as languages from '../../../../editor/common/languages.js';

CommandsRegistry.registerCommand(
	'_executeMappedEditsProvider',
	async (
		accessor: ServicesAccessor,
		documentUri: URI,
		codeBlocks: string[],
		context: languages.MappedEditsContext
	): Promise<languages.WorkspaceEdit | null> => {

		const modelService = accessor.get(ITextModelService);
		const langFeaturesService = accessor.get(ILanguageFeaturesService);

		const document = await modelService.createModelReference(documentUri);

		let result: languages.WorkspaceEdit | null = null;

		try {
			const providers = langFeaturesService.mappedEditsProvider.ordered(document.object.textEditorModel);

			if (providers.length > 0) {
				const mostRelevantProvider = providers[0];

				const cancellationTokenSource = new CancellationTokenSource();

				result = await mostRelevantProvider.provideMappedEdits(
					document.object.textEditorModel,
					codeBlocks,
					context,
					cancellationTokenSource.token
				);
			}
		} finally {
			document.dispose();
		}

		return result;
	}
);
