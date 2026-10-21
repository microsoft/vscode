/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import type { ArtifactAutomationNotice } from './artifactRuntime.js';

export const ArtifactIntegrationsSettingId = 'chat.artifactIntegrations.enabled';

export type ArtifactJsonValue = null | boolean | number | string | readonly ArtifactJsonValue[] | { readonly [key: string]: ArtifactJsonValue };

export interface ArtifactOrigin {
	readonly chat: string;
	readonly turnId?: string;
}

export interface ArtifactRecord {
	readonly id: string;
	readonly resource: string;
	readonly label: string;
	readonly isArtifact?: boolean;
	readonly origin?: ArtifactOrigin;
}

export function artifactBindingId(authority: string, session: string, artifactId: string, integrationId: string): string {
	return JSON.stringify([authority, session, artifactId, integrationId]);
}

export interface ArtifactAuthority {
	readonly id: string;
	readonly targetHost: string;
	readonly location: 'host' | 'client';
}

export type ArtifactAvailability =
	| { readonly kind: 'available'; readonly observedAt?: number }
	| { readonly kind: 'loading' }
	| { readonly kind: 'stale' | 'authenticationRequired' | 'unavailable' | 'error'; readonly reason: string; readonly observedAt?: number };

export interface ArtifactIcon {
	readonly id: string;
	readonly colorId?: string;
}

export interface ArtifactPartPresentation {
	readonly icon: ArtifactIcon;
	readonly label: string;
	/** A plain-text explanation of a compact label, including its status. */
	readonly description?: string;
	readonly detailsId: string;
}

export interface ArtifactSectionPresentation extends ArtifactPartPresentation {
	readonly id: string;
}

export interface ArtifactDetailsList {
	readonly id: string;
	readonly label: string;
	/** List identity independent of the presence of a compact pill section. */
	readonly icon?: ArtifactIcon;
	readonly detailsId: string;
}

export interface ArtifactActionAvailability {
	readonly enabled: boolean;
	readonly disabledReason?: string;
}

export interface ArtifactActionView extends ArtifactActionAvailability {
	readonly id: string;
	/** When present, manual invocation also requires an enabled entry for the invoking chat. */
	readonly chatAvailability?: Readonly<Record<string, ArtifactActionAvailability>>;
}

export interface ArtifactContributionView {
	readonly availability: ArtifactAvailability;
	readonly main?: ArtifactPartPresentation;
	readonly sections: readonly ArtifactSectionPresentation[];
	/** Independent state lists, including lists without a compact pill section. */
	readonly lists?: readonly ArtifactDetailsList[];
	/** Actions relevant to the current resource state. Omit inapplicable actions; disable those temporarily blocked. */
	readonly stateActions: readonly ArtifactActionView[];
	readonly generalActions: readonly ArtifactActionView[];
	readonly automationAvailability: readonly { readonly id: string; readonly available: boolean; readonly unavailableReason?: string; readonly enablement?: ArtifactActionAvailability }[];
}

export type ArtifactDetailsLink =
	| { readonly kind: 'action'; readonly actionId: string }
	| { readonly kind: 'automation'; readonly optionId: string };

export interface ArtifactDetails {
	readonly availability: ArtifactAvailability;
	readonly title: string;
	readonly description?: string;
	/** Descriptions are plain text unless explicitly marked as untrusted Markdown. */
	readonly descriptionFormat?: 'plaintext' | 'markdown';
	readonly facts?: readonly { readonly id: string; readonly label: string; readonly value: string }[];
	readonly links: readonly ArtifactDetailsLink[];
	readonly items: readonly { readonly id: string; readonly icon: ArtifactIcon; readonly label: string; readonly description?: string; readonly resource: string }[];
	readonly completeness: 'complete' | 'partial';
}

export interface IArtifactDetailsModel extends IDisposable {
	readonly details: IObservable<ArtifactDetails>;
	loadMore?(token: CancellationToken): Promise<void>;
}

interface ArtifactAutomationOptionBase {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly actionIds: readonly string[];
	readonly maxAttempts: number;
	/** Change this when the rule's meaning, schedule, or permissions expand. */
	readonly consentVersion?: string;
}

export type ArtifactAutomationOption = ArtifactAutomationOptionBase & (
	| { readonly kind: 'boolean'; readonly defaultValue: false }
	| {
		readonly kind: 'enum';
		readonly choices: readonly { readonly value: string; readonly label: string; readonly description?: string }[];
		readonly disabledValue: string;
		readonly defaultValue: string;
	}
);

export interface ArtifactAutomationDisablement {
	readonly reason: string;
	readonly attempts: number;
	readonly lastRunId?: string;
}

/** Who asked for a change: a person in the UI, or an agent through its tools, with the person's confirmation where required. */
export type ArtifactActor =
	| { readonly kind: 'user' }
	| { readonly kind: 'agent'; readonly chat: string; readonly turnId?: string };

export interface ArtifactAutomationConfiguration {
	readonly revision: number;
	readonly values: Readonly<Record<string, boolean | string>>;
	readonly generations: Readonly<Record<string, number>>;
	/** Absent on configurations persisted before enablement timestamps were recorded. */
	readonly enabledAt?: Readonly<Record<string, number>>;
	/** Who turned on each option's current consent generation; meaningful only while the option is enabled. */
	readonly grants?: Readonly<Record<string, ArtifactActor>>;
	readonly disablements: Readonly<Record<string, ArtifactAutomationDisablement>>;
}

export interface IArtifactBindingStateStore {
	read(): { readonly revision: number; readonly value?: ArtifactJsonValue };
	write(expectedRevision: number, value: ArtifactJsonValue): Promise<void>;
}

export interface IArtifactBindingContext {
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly configuration: IObservable<ArtifactAutomationConfiguration>;
	readonly state: IArtifactBindingStateStore;
}

export interface ArtifactResourceMatch {
	readonly resource: URI;
	/** Stable canonical identity within this integration, including aliases of the same resource. */
	readonly key: string;
	readonly credentialScope: string;
}

/** A protected resource challenge, never a credential or permission to execute an artifact action. */
export interface ArtifactAuthenticationRequest {
	readonly resource: string;
	readonly authorizationServers?: readonly string[];
	readonly scopes?: readonly string[];
}

/** Allows matching or resource creation to expose recovery without establishing an account binding. */
export class ArtifactAuthenticationRequiredError extends Error {
	constructor(message: string, readonly main: ArtifactPartPresentation) {
		super(message);
		this.name = 'ArtifactAuthenticationRequiredError';
	}
}

export interface IArtifactResourceContext {
	readonly authority: ArtifactAuthority;
	readonly runtimeId: string;
}

export interface IArtifactIntegration<TResource extends IDisposable> {
	readonly id: string;
	readonly label: string;
	/** Plain text naming the recorded resources this integration supports, so agents know when to use it. */
	readonly description?: string;
	readonly automationOptions: readonly ArtifactAutomationOption[];
	/** Higher priority wins; ties are resolved by integration ID, never response order. */
	readonly presentationPriority?: number;
	readonly onDidChange?: Event<void>;
	match(resource: URI, token: CancellationToken, artifact: ArtifactRecord): ArtifactResourceMatch | undefined | Promise<ArtifactResourceMatch | undefined>;
	/** Supplies a challenge the client fulfills by authenticating with the coordinator that runs this integration. */
	getAuthenticationRequest?(resource: URI, token: CancellationToken, artifact: ArtifactRecord): ArtifactAuthenticationRequest | Promise<ArtifactAuthenticationRequest>;
	/** Signs in within this integration's own runtime, so its credentials never reach another coordinator. */
	signIn?(resource: URI, token: CancellationToken, artifact: ArtifactRecord): Promise<void>;
	createResource(match: ArtifactResourceMatch, context: IArtifactResourceContext, token: CancellationToken): Promise<TResource>;
	createBinding(resource: TResource, context: IArtifactBindingContext): IArtifactIntegrationBinding;
}

export interface IArtifactIntegrationBinding extends IDisposable {
	readonly view: IObservable<ArtifactContributionView>;
	readonly actions: readonly ArtifactAction[];
	acquireDetails(detailsId: string): IArtifactDetailsModel;
	activateAutomation(context: IArtifactAutomationContext): IDisposable;
}

export interface ArtifactActionDescriptor {
	readonly id: string;
	readonly iconId: string;
	readonly label: string;
	readonly kind: 'code' | 'prompt';
	/** Change this when an existing action's effects or required permissions expand. */
	readonly consentVersion?: string;
}

export type ArtifactPreparation<T> =
	| { readonly kind: 'ready'; readonly value: T }
	| { readonly kind: 'skip'; readonly reason: string };

export type ArtifactAction = ArtifactActionDescriptor & (
	| {
		readonly kind: 'code';
		readonly executionScope: 'resource' | 'resourceAndWorkspace';
		prepare(context: IArtifactActionContext, token: CancellationToken): Promise<ArtifactPreparation<IArtifactCodeExecution>>;
		reconcile?(context: IArtifactActionContext, token: CancellationToken): Promise<ArtifactReconciliation>;
	}
	| {
		readonly kind: 'prompt';
		prepare(context: IArtifactActionContext, token: CancellationToken): Promise<ArtifactPreparation<ArtifactPrompt>>;
	}
);

export interface IArtifactActionContext {
	readonly authority: ArtifactAuthority;
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly integrationId: string;
	readonly run: ArtifactRun;
}

export interface IArtifactCodeExecution {
	run(context: { readonly token: CancellationToken; readonly runId: string }): Promise<ArtifactCodeResult>;
}

export type ArtifactCodeResult =
	| { readonly kind: 'completed'; readonly summary: string; readonly result?: ArtifactJsonValue }
	| { readonly kind: 'skipped'; readonly reason: string };

export type ArtifactReconciliation =
	| { readonly kind: 'completed'; readonly summary: string }
	| { readonly kind: 'notExecuted' }
	| { readonly kind: 'indeterminate'; readonly reason: string };

export interface ArtifactPrompt {
	readonly text: string;
}

/** A point-in-time description of an artifact action, independent of its model-facing prompt. */
export interface ArtifactRequestPresentation {
	readonly version: 1;
	readonly integrationLabel: string;
	readonly source: 'manual' | 'automation';
	readonly action: { readonly label: string; readonly iconId: string };
	readonly artifact: {
		readonly resource: string;
		readonly label: string;
		readonly description?: string;
		readonly icon?: ArtifactIcon;
	};
	readonly details: readonly ArtifactDetails[];
}

export interface ArtifactAutomationRequest {
	readonly optionId: string;
	readonly actionId: string;
	readonly configurationRevision: number;
	readonly occurrenceKey: string;
	readonly reason: string;
	readonly input?: ArtifactJsonValue;
	readonly retryOf?: string;
}

export interface IArtifactAutomationContext {
	runAutomation(request: ArtifactAutomationRequest): Promise<ArtifactRun>;
	reconcileRun(runId: string): Promise<void>;
	/** Providers may revoke consent, but cannot grant or broaden it. */
	disableAutomation(optionId: string, expectedRevision: number, reason: string): Promise<void>;
	readonly runs: IObservable<readonly ArtifactRun[]>;
}

export type ArtifactRunState = 'queued' | 'preparing' | 'blocked' | 'submitted' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled' | 'interrupted';

export type ArtifactPromptReceipt =
	| { readonly kind: 'queued'; readonly queuedMessageId: string }
	| { readonly kind: 'turn'; readonly turnId: string };

export interface ArtifactRun {
	readonly id: string;
	readonly bindingId: string;
	readonly integrationId: string;
	readonly actionId: string;
	readonly actionKind: 'code' | 'prompt';
	readonly actionConsent: string;
	readonly source: 'manual' | 'automation';
	/** Who asked for a manual run. */
	readonly requestedBy?: ArtifactActor;
	readonly requestId: string;
	readonly state: ArtifactRunState;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly reason: string;
	readonly input?: ArtifactJsonValue;
	readonly optionId?: string;
	readonly configurationRevision?: number;
	readonly generation?: number;
	readonly occurrenceKey?: string;
	readonly retryOf?: string;
	readonly chat?: string;
	readonly admission?: 'atomic' | 'bestEffort';
	readonly receipt?: ArtifactPromptReceipt;
	readonly prompt?: ArtifactPrompt;
	readonly presentation?: ArtifactRequestPresentation;
	readonly dispatched: boolean;
	readonly indeterminate?: boolean;
	readonly result?: ArtifactJsonValue;
}

export interface ArtifactContributionSnapshot {
	readonly integrationId: string;
	/** Execution authority when contributions from multiple runtimes share a presentation. */
	readonly authority?: ArtifactAuthority;
	readonly label: string;
	readonly view: ArtifactContributionView;
	readonly actions: readonly ArtifactActionDescriptor[];
	readonly options: readonly ArtifactAutomationOption[];
	readonly configuration: ArtifactAutomationConfiguration;
	/** Sign-in availability; `handledByIntegration` means the integration signs in within its own runtime. */
	readonly authentication?: ArtifactActionAvailability & { readonly handledByIntegration?: boolean };
}

export interface ArtifactSnapshot {
	readonly authority: ArtifactAuthority;
	readonly session: string;
	readonly artifact: ArtifactRecord;
	readonly contributions: readonly ArtifactContributionSnapshot[];
	readonly mainIntegrationId?: string;
	readonly runs: readonly ArtifactRun[];
}

export interface IArtifactModel {
	readonly snapshot: IObservable<ArtifactSnapshot>;
	/**
	 * Requests recovery in the invoking client; completion does not imply that authentication succeeded.
	 * Resolves with the challenge the client fulfilled, or `undefined` when the integration signed in within its own runtime.
	 */
	requestAuthentication(integrationId: string): Promise<ArtifactAuthenticationRequest | undefined>;
	/** `actor` defaults to the user; agents pass their chat and turn so consent records who asked. */
	configure(integrationId: string, expectedRevision: number, values: Readonly<Record<string, boolean | string>>, actor?: ArtifactActor): Promise<void>;
	/** `actor` defaults to the user; agents pass their chat and turn so the run records who asked. */
	invoke(integrationId: string, actionId: string, chat: string, requestId: string, actor?: ArtifactActor): Promise<ArtifactRun>;
	cancel(runId: string): Promise<void>;
	reconcile(runId: string): Promise<void>;
	/** Newest first. The optional cursor is the preceding page's last run ID; page size is 1-200. */
	getRuns(before?: string, limit?: number): Promise<{ readonly runs: readonly ArtifactRun[]; readonly next?: string }>;
	acquireDetails(integrationId: string, detailsId: string): Promise<IArtifactDetailsModel>;
}

export interface IArtifactIntegrationAccess {
	acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>>;
	postNotice?(notice: ArtifactAutomationNotice): Promise<void>;
}

export const MAX_ARTIFACT_INTEGRATION_DESCRIPTION_LENGTH = 300;
export const MAX_ARTIFACT_INTEGRATION_LABEL_LENGTH = 100;

/** An agent-facing summary of a registered integration, independent of any recorded artifact. */
export interface ArtifactIntegrationDescriptor {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly automationOptions: readonly { readonly id: string; readonly label: string }[];
}

export function toArtifactIntegrationDescriptor(integration: { readonly id: string; readonly label: string; readonly description?: string; readonly options: readonly ArtifactAutomationOption[] }): ArtifactIntegrationDescriptor {
	return {
		id: integration.id,
		label: integration.label,
		...(integration.description ? { description: integration.description } : {}),
		automationOptions: integration.options.map(option => ({ id: option.id, label: option.label })),
	};
}

export function getArtifactActionAvailability(action: ArtifactActionView, chat: string | undefined): ArtifactActionAvailability {
	if (!action.enabled || !action.chatAvailability) {
		return action;
	}
	return chat !== undefined && Object.hasOwn(action.chatAvailability, chat) ? action.chatAvailability[chat]
		: { enabled: false, disabledReason: localize('artifactInvokingChatUnavailable', "This action is not available in the invoking chat.") };
}

/** Who started a run: a person, an agent through its tools, or an automation rule. */
export type ArtifactRunInitiator = 'user' | 'agent' | 'automation';

export function getArtifactRunInitiator(run: Pick<ArtifactRun, 'source' | 'requestedBy'>): ArtifactRunInitiator {
	return run.source === 'automation' ? 'automation' : run.requestedBy?.kind === 'agent' ? 'agent' : 'user';
}

export function isArtifactRunSettled(run: ArtifactRun): boolean {
	return run.state === 'completed' || run.state === 'skipped' || run.state === 'failed' || run.state === 'cancelled' || run.state === 'interrupted';
}

export function artifactOptionDisabledValue(option: ArtifactAutomationOption): boolean | string {
	return option.kind === 'boolean' ? false : option.disabledValue;
}

export function isArtifactOptionEnabled(option: ArtifactAutomationOption, value: boolean | string | undefined): boolean {
	return option.kind === 'boolean' ? value === true : typeof value === 'string' && value !== option.disabledValue && option.choices.some(choice => choice.value === value);
}
