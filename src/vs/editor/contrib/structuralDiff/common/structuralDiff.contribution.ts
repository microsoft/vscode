/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../common/services/textResourceConfiguration.js';
import { StructuralDiffs } from './structuralDiff.js';

CommandsRegistry.registerCommand('_executeStructuralDiffProvider', async (accessor, originalResource: URI, modifiedResource: URI) => {
	assertType(URI.isUri(originalResource));
	assertType(URI.isUri(modifiedResource));

	const workerService = accessor.get(IEditorWorkerService);
	const configurationService = accessor.get(ITextResourceConfigurationService);
	const languageFeaturesService = accessor.get(ILanguageFeaturesService);
	const modelService = accessor.get(ITextModelService);
	const references = new DisposableStore();
	try {
		const original = references.add(await modelService.createModelReference(originalResource));
		const modified = references.add(await modelService.createModelReference(modifiedResource));
		return await StructuralDiffs.compute(workerService, configurationService, languageFeaturesService.structuralDiffProvider, original.object.textEditorModel, modified.object.textEditorModel, CancellationToken.None);
	} finally {
		references.dispose();
	}
});
