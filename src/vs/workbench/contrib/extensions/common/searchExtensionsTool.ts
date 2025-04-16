/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { SortBy } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../chat/common/languageModelToolsService.js';
import { ExtensionState, IExtensionsWorkbenchService } from '../common/extensions.js';

export const SearchExtensionsToolId = 'vscode_searchExtensions_internal';

export const SearchExtensionsToolData: IToolData = {
	id: SearchExtensionsToolId,
	toolReferenceName: 'extensions',
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.extensions.id),
	supportsToolPicker: true,
	displayName: localize('searchExtensionsTool.displayName', 'Search Extensions'),
	modelDescription: localize('searchExtensionsTool.modelDescription', "This tool helps the model search for VS Code extensions from the Marketplace. The model should specify the category of extensions and keywords to search for. Note that the results may include false positives, so further filtering by reviewing the results is recommended."),
	source: { type: 'internal' },
	inputSchema: {
		type: 'object',
		properties: {
			category: {
				type: 'string',
				description: 'The category of extensions to search for',
				enum: EXTENSION_CATEGORIES,
			},
			keywords: {
				type: 'array',
				items: {
					type: 'string',
				},
				description: 'The keywords to search for',
			},
		},
	}
};

type InputParams = {
	category?: string;
	keywords?: string;
};

type ExtensionData = {
	id: string;
	name: string;
	description: string;
	installed: boolean;
	installCount: number;
	rating: number;
	categories: readonly string[];
	tags: readonly string[];
};

export class SearchExtensionsTool implements IToolImpl {

	constructor(
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as InputParams;
		if (!params.keywords?.length && !params.category) {
			return {
				content: [{
					kind: 'text',
					value: localize('searchExtensionsTool.noInput', 'Please provide a category or keyword to search for.')
				}]
			};
		}

		const extensionsMap = new Map<string, ExtensionData>();
		const queryAndAddExtensions = async (text: string) => {
			const extensions = await this.extensionWorkbenchService.queryGallery({
				text,
				pageSize: 10,
				sortBy: SortBy.InstallCount
			}, token);
			if (extensions.firstPage.length) {
				for (const extension of extensions.firstPage) {
					if (extension.deprecationInfo || extension.isMalicious) {
						continue;
					}
					extensionsMap.set(extension.identifier.id.toLowerCase(), {
						id: extension.identifier.id,
						name: extension.displayName,
						description: extension.description,
						installed: extension.state === ExtensionState.Installed,
						installCount: extension.installCount ?? 0,
						rating: extension.rating ?? 0,
						categories: extension.categories ?? [],
						tags: extension.gallery?.tags ?? []
					});
				}
			}
		};

		if (params.keywords?.length) {
			for (const keyword of params.keywords ?? []) {
				if (keyword === 'featured') {
					await queryAndAddExtensions('featured');
				} else {
					let text = params.category ? `category:"${params.category}"` : '';
					text = keyword ? `${text} ${keyword}`.trim() : text;
					await queryAndAddExtensions(text);
				}
			}
		} else {
			await queryAndAddExtensions(`category:"${params.category}"`);
		}

		const result = Array.from(extensionsMap.values());

		return {
			content: [{
				kind: 'text',
				value: `Here are the list of extensions:\n${JSON.stringify(result)}\n. Use the following format to display extensions to the user because there is a renderer available to parse these extensions in this format and display them with all details. So, do not describe about the extensions to the user.\n\`\`\`vscode-extensions\nextensionId1,extensionId2\n\`\`\`\n.`
			}],
			toolResultDetails: {
				input: JSON.stringify(params),
				output: JSON.stringify(result.map(extension => extension.id))
			}
		};
	}
}

