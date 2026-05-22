/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import { ICompletionsRecentEditsProviderService } from '../recentEdits/recentEditsProvider';
import { CodeSnippets } from './codeSnippets';
import { AdditionalCompletionsContext, StableCompletionsContext } from './completionsContext';
import { DocumentPrefix, DocumentSuffix } from './currentFile';
import { Diagnostics } from './diagnostics';
import { DocumentMarker } from './marker';
import { RecentEdits } from './recentEdits';
import { SimilarFiles } from './similarFiles';
import { Traits } from './traits';

/**
 * Function that returns the prompt structure for a code completion request following the split context prompt design
 * that optimizes for cache hits.
 */
export function splitContextCompletionsPrompt(accessor: ServicesAccessor) {
	const instantiationService = accessor.get(IInstantiationService);
	const tdms = accessor.get(ICompletionsTextDocumentManagerService);
	const recentEditsProvider = accessor.get(ICompletionsRecentEditsProviderService);
	return (
		<>
			<StableCompletionsContext>
				<DocumentMarker tdms={tdms} weight={0.7} />
				<Traits weight={0.6} />
				<Diagnostics tdms={tdms} weight={0.65} />
				<CodeSnippets tdms={tdms} weight={0.9} />
				<SimilarFiles tdms={tdms} instantiationService={instantiationService} weight={0.8} />
			</StableCompletionsContext>
			<DocumentSuffix weight={1} />
			<AdditionalCompletionsContext>
				<RecentEdits tdms={tdms} recentEditsProvider={recentEditsProvider} weight={0.99} />
			</AdditionalCompletionsContext>
			<DocumentPrefix weight={1} />
		</>
	);
}
