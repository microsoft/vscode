/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { normalizeLanguageId } from '../../../../prompt/src/prompt';
import {
	CompletionRequestData,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';
import { TraitWithId } from '../contextProviders/contextItemSchemas';

export const Traits = (_props: PromptElementProps, context: ComponentContext) => {
	const [traits, setTraits] = context.useState<TraitWithId[]>();
	const [languageId, setLanguageId] = context.useState<string>();

	context.useData(isCompletionRequestData, (data: CompletionRequestData) => {
		if (data.traits !== traits) {
			setTraits(data.traits);
		}

		const normalizedLanguageId = normalizeLanguageId(data.document.detectedLanguageId);
		if (normalizedLanguageId !== languageId) {
			setLanguageId(normalizedLanguageId);
		}
	});

	if (!traits || traits.length === 0 || !languageId) {
		return;
	}

	// TODO: use a `KeepTogether` elision that removes the header if no traits are present
	return (
		<>
			<Text>{'Consider this related information:\n'}</Text>
			{...traits.map(trait => (
				<Text key={trait.id} source={trait}>
					{`${trait.name}: ${trait.value}`}
				</Text>
			))}
		</>
	);
};
