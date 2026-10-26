/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';

/** How a "no workspace" choice reads in a workspace picker. */
export interface INoWorkspaceChoicePresentation {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
}

/** The label of a provider's quick chat in New Session's workspace picker. */
export function getQuickChatProviderLabel(provider: Pick<ISessionsProvider, 'id' | 'label'>): string {
	return provider.id === LOCAL_AGENT_HOST_PROVIDER_ID
		? localize('newSessionWorkspacePicker.localQuickChat', "This Computer")
		: provider.label;
}

/** The label of a remote provider's quick chat once it is the selected workspace. */
export function getRemoteQuickChatSelectedLabel(provider: Pick<ISessionsProvider, 'label'>): string {
	return localize('newSessionWorkspacePicker.remoteQuickChat', "Chat [{0}]", provider.label);
}

export function getNoWorkspaceDescription(): string {
	return localize('newSessionWorkspacePicker.noWorkspaceDescription', "Start without a backing workspace");
}

/**
 * How New Session's workspace picker presents choosing no workspace. With the unified workspace picker it
 * is the provider's quick chat, otherwise the plain "No workspace" choice.
 */
export function getNoWorkspaceChoicePresentation(unifiedWorkspacePicker: boolean, provider: Pick<ISessionsProvider, 'id' | 'label' | 'icon'> | undefined): INoWorkspaceChoicePresentation {
	const description = getNoWorkspaceDescription();
	if (!unifiedWorkspacePicker) {
		return { label: localize('workspacePicker.noWorkspace', "No workspace"), icon: Codicon.commentDiscussion, description };
	}
	if (!provider) {
		return { label: localize('workspacePicker.chat', "Chat"), icon: Codicon.comment, description };
	}
	return {
		label: provider.id === LOCAL_AGENT_HOST_PROVIDER_ID ? getQuickChatProviderLabel(provider) : getRemoteQuickChatSelectedLabel(provider),
		icon: provider.icon,
		description,
	};
}
