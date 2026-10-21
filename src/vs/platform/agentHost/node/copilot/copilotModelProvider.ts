/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelProvider } from '../../common/meta/agentModelProvider.js';

interface ICopilotModelProviderSource {
	readonly provider?: Pick<IAgentModelProvider, 'id' | 'kind' | 'label'>;
	readonly providerBinding?: {
		readonly id: string;
		readonly label: string;
		readonly provenance: { readonly providerKind: string; readonly source: string };
		readonly accountRef?: { readonly selectionId: string };
	};
}

/** Projects optional SDK provenance without requiring a binding-aware packaged SDK. */
export function getCopilotModelProvider(source: ICopilotModelProviderSource): IAgentModelProvider | undefined {
	const binding = source.providerBinding;
	if (binding !== undefined) {
		return {
			id: binding?.id,
			kind: binding?.provenance?.providerKind,
			label: binding?.label,
			binding: {
				source: binding?.provenance?.source,
				...(binding?.accountRef !== undefined ? { accountRef: { selectionId: binding.accountRef?.selectionId } } : {}),
			},
		};
	}
	const provider = source.provider;
	return provider !== undefined ? { id: provider?.id, kind: provider?.kind, label: provider?.label } : undefined;
}
