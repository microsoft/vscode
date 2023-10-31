/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as languages from 'vs/editor/common/languages';

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
