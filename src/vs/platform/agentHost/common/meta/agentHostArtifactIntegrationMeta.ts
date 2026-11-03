/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';
import { MessageKind, type Message } from '../state/sessionState.js';
import type { ArtifactAutomationEnabledRules, ArtifactAutomationNotice, ArtifactAutomationNoticeChange } from '../../../artifactIntegrations/common/artifactRuntime.js';
import { isObject } from '../../../../base/common/types.js';
import { ArtifactRequestPresentation, ArtifactRunInitiator } from '../../../artifactIntegrations/common/artifactIntegration.js';
import { isArtifactRequestPresentation } from '../../../artifactIntegrations/common/artifactPresentationValidation.js';
import { hasArtifactAutomationEnabledRules, isArtifactAutomationEnabledRules, isArtifactAutomationNoticeChanges } from '../../../artifactIntegrations/common/artifactIntegrationNotices.js';

export const AgentHostArtifactIntegrationsCapabilityMetaKey = 'vscode.artifactIntegrations';
export const AgentHostArtifactNoticesCapabilityMetaKey = 'vscode.artifactIntegrationNotices';
export const AgentHostArtifactRunMetaKey = 'vscode.artifactIntegrationRun';
export const AgentHostArtifactRunInitiatorMetaKey = 'vscode.artifactIntegrationRunInitiator';
export const AgentHostArtifactNoticeMetaKey = 'vscode.artifactIntegrationNotice';
export const AgentHostArtifactRequestMetaKey = 'vscode.artifactIntegrationRequest';

export function getAgentHostArtifactIntegrationsCapability(result: InitializeResult | undefined): 'pending' | 'supported' | 'unsupported' {
	if (!result) {
		return 'pending';
	}
	const version = result._meta?.[AgentHostArtifactIntegrationsCapabilityMetaKey];
	return version === 1 ? 'supported' : version === undefined ? 'unsupported' : 'pending';
}

export function supportsArtifactIntegrationNotices(result: InitializeResult | undefined): boolean {
	return getAgentHostArtifactIntegrationsCapability(result) === 'supported' && result?._meta?.[AgentHostArtifactNoticesCapabilityMetaKey] === 1;
}

export function readArtifactIntegrationRun(message: Message): string | undefined {
	const value = message._meta?.[AgentHostArtifactRunMetaKey];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Who started the artifact run that sent `message`, when its coordinator recorded it. */
export function readArtifactIntegrationRunInitiator(message: Message): ArtifactRunInitiator | undefined {
	const value = message._meta?.[AgentHostArtifactRunInitiatorMetaKey];
	return value === 'user' || value === 'agent' || value === 'automation' ? value : undefined;
}

export function readArtifactIntegrationRequest(message: Message): ArtifactRequestPresentation | undefined {
	const value = message._meta?.[AgentHostArtifactRequestMetaKey];
	return message.origin.kind === MessageKind.SystemNotification && readArtifactIntegrationRun(message) && isArtifactRequestPresentation(value) ? value : undefined;
}

export function readArtifactIntegrationNotice(source: { readonly _meta?: Record<string, unknown> }): Pick<ArtifactAutomationNotice, 'kind' | 'iconId'> | undefined {
	const value = source._meta?.[AgentHostArtifactNoticeMetaKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { kind, iconId } = value as Record<string, unknown>;
	if (kind !== 'enabled' && kind !== 'changed' && kind !== 'disabled') {
		return undefined;
	}
	return { kind, iconId: typeof iconId === 'string' ? iconId : undefined };
}

/** The rule changes of a notice, which let the host merge later changes of the same artifact into it. */
export interface IArtifactIntegrationNoticeChanges {
	readonly artifactId: string;
	readonly artifactLabel: string;
	readonly changes: readonly ArtifactAutomationNoticeChange[];
	readonly enabledRules: readonly ArtifactAutomationEnabledRules[];
}

export function toArtifactIntegrationNoticeMeta(notice: Pick<ArtifactAutomationNotice, 'kind' | 'iconId'>, changes: IArtifactIntegrationNoticeChanges | undefined): Record<string, unknown> {
	return { [AgentHostArtifactNoticeMetaKey]: { kind: notice.kind, iconId: notice.iconId, ...changes } };
}

export function readArtifactIntegrationNoticeChanges(source: { readonly _meta?: Record<string, unknown> }): IArtifactIntegrationNoticeChanges | undefined {
	const value = source._meta?.[AgentHostArtifactNoticeMetaKey];
	if (!readArtifactIntegrationNotice(source) || !isObject(value)) {
		return undefined;
	}
	const { artifactId, artifactLabel, changes, enabledRules } = value as Record<string, unknown>;
	return typeof artifactId === 'string' && typeof artifactLabel === 'string' && isArtifactAutomationNoticeChanges(changes) && isArtifactAutomationEnabledRules(enabledRules)
		&& hasArtifactAutomationEnabledRules(changes, enabledRules)
		? { artifactId, artifactLabel, changes, enabledRules } : undefined;
}
