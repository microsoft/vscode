/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IFigExecuteExternals } from '../../execute';
import {
	runCachedGenerator,
	GeneratorContext,
	haveContextForGenerator,
} from './helpers';

export async function getCustomSuggestions(
	generator: Fig.Generator,
	context: GeneratorContext,
	executableExternals: IFigExecuteExternals
): Promise<Fig.Suggestion[] | undefined> {
	if (!generator.custom) {
		return [];
	}

	if (!haveContextForGenerator(context)) {
		console.info('Don\'t have context for custom generator');
		return [];
	}

	const {
		tokenArray,
		currentWorkingDirectory,
		currentProcess,
		isDangerous,
		searchTerm,
		environmentVariables,
	} = context;

	try {
		const result = await runCachedGenerator(
			generator,
			context,
			() =>
				generator.custom!(tokenArray, executableExternals.executeCommand, {
					currentWorkingDirectory,
					currentProcess,
					sshPrefix: '',
					searchTerm,
					environmentVariables,
					isDangerous,
				}),
			generator.cache?.cacheKey,
		);

		return result?.map((name) => ({ ...name, type: name?.type || 'arg' }));
	} catch (e) {
		console.error('we had an error with the custom function generator', e);

		return [];
	}
}
