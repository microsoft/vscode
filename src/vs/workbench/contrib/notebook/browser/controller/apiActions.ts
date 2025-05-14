/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from '../../../../../base/common/glob.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isDocumentExcludePattern, TransientCellMetadata, TransientDocumentMetadata } from '../../common/notebookCommon.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { INotebookService } from '../../common/notebookService.js';

CommandsRegistry.registerCommand('_resolveNotebookContentProvider', (accessor): {
	viewType: string;
	displayName: string;
	options: { transientOutputs: boolean; transientCellMetadata: TransientCellMetadata; transientDocumentMetadata: TransientDocumentMetadata };
	filenamePattern: (string | glob.IRelativePattern | { include: string | glob.IRelativePattern; exclude: string | glob.IRelativePattern })[];
}[] => {
	const notebookService = accessor.get<INotebookService>(INotebookService);
	const contentProviders = notebookService.getContributedNotebookTypes();
	return contentProviders.map(provider => {
		const filenamePatterns = provider.selectors.map(selector => {
			if (typeof selector === 'string') {
				return selector;
			}

			if (glob.isRelativePattern(selector)) {
				return selector;
			}

			if (isDocumentExcludePattern(selector)) {
				return {
					include: selector.include,
					exclude: selector.exclude
				};
			}

			return null;
		}).filter(pattern => pattern !== null) as (string | glob.IRelativePattern | { include: string | glob.IRelativePattern; exclude: string | glob.IRelativePattern })[];

		return {
			viewType: provider.id,
			displayName: provider.displayName,
			filenamePattern: filenamePatterns,
			options: {
				transientCellMetadata: provider.options.transientCellMetadata,
				transientDocumentMetadata: provider.options.transientDocumentMetadata,
				transientOutputs: provider.options.transientOutputs
			}
		};
	});
});

CommandsRegistry.registerCommand('_resolveNotebookKernels', async (accessor, args: {
	viewType: string;
	uri: UriComponents;
}): Promise<{
	id?: string;
	label: string;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	preloads?: URI[];
}[]> => {
	const notebookKernelService = accessor.get(INotebookKernelService);
	const uri = URI.revive(args.uri as UriComponents);
	const kernels = notebookKernelService.getMatchingKernel({ uri, notebookType: args.viewType });

	return kernels.all.map(provider => ({
		id: provider.id,
		label: provider.label,
		description: provider.description,
		detail: provider.detail,
		isPreferred: false, // todo@jrieken,@rebornix
		preloads: provider.preloadUris,
	}));
});
