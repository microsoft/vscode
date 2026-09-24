/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';

export type ArtifactJsonValue = null | boolean | number | string | readonly ArtifactJsonValue[] | { readonly [key: string]: ArtifactJsonValue };

export interface ArtifactOrigin {
	readonly chat: string;
	readonly turnId?: string;
}

export interface ArtifactRecord {
	readonly id: string;
	readonly resource: string;
	readonly label: string;
	readonly origin?: ArtifactOrigin;
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
	readonly detailsId: string;
}

export interface ArtifactSectionPresentation extends ArtifactPartPresentation {
	readonly id: string;
}

export interface ArtifactActionView {
	readonly id: string;
	readonly enabled: boolean;
	readonly disabledReason?: string;
}

export interface ArtifactContributionView {
	readonly availability: ArtifactAvailability;
	readonly main?: ArtifactPartPresentation;
	readonly sections: readonly ArtifactSectionPresentation[];
	readonly stateActions: readonly ArtifactActionView[];
	readonly generalActions: readonly ArtifactActionView[];
	readonly automationAvailability: readonly { readonly id: string; readonly available: boolean; readonly unavailableReason?: string }[];
}

export type ArtifactDetailsLink =
	| { readonly kind: 'action'; readonly actionId: string }
	| { readonly kind: 'automation'; readonly optionId: string };

export interface ArtifactDetails {
	readonly availability: ArtifactAvailability;
	readonly title: string;
	readonly description?: string;
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

export interface ArtifactAutomationConfiguration {
	readonly revision: number;
	readonly values: Readonly<Record<string, boolean | string>>;
	readonly generations: Readonly<Record<string, number>>;
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

export interface IArtifactResourceContext {
	readonly authority: ArtifactAuthority;
	readonly runtimeId: string;
}

export interface IArtifactIntegration<TResource extends IDisposable> {
	readonly id: string;
	readonly label: string;
	readonly automationOptions: readonly ArtifactAutomationOption[];
	/** Higher priority wins; ties are resolved by integration ID, never response order. */
	readonly presentationPriority?: number;
	match(resource: URI, token: CancellationToken): ArtifactResourceMatch | undefined | Promise<ArtifactResourceMatch | undefined>;
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
	readonly runs: IObservable<readonly ArtifactRun[]>;
}

export type ArtifactRunState = 'queued' | 'preparing' | 'blocked' | 'submitted' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled' | 'interrupted';

export type ArtifactPromptReceipt =
	| { readonly kind: 'queued'; readonly queuedMessageId: string }
	| { readonly kind: 'turn'; readonly turnId: string };

export interface ArtifactRun {
	readonly id: string;
	readonly bindingId: string;
	readonly actionId: string;
	readonly actionKind: 'code' | 'prompt';
	readonly actionConsent: string;
	readonly source: 'manual' | 'automation';
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
	readonly dispatched: boolean;
	readonly indeterminate?: boolean;
	readonly result?: ArtifactJsonValue;
}

export interface ArtifactContributionSnapshot {
	readonly integrationId: string;
	readonly label: string;
	readonly view: ArtifactContributionView;
	readonly actions: readonly ArtifactActionDescriptor[];
	readonly options: readonly ArtifactAutomationOption[];
	readonly configuration: ArtifactAutomationConfiguration;
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
	configure(integrationId: string, expectedRevision: number, values: Readonly<Record<string, boolean | string>>): Promise<void>;
	invoke(integrationId: string, actionId: string, chat: string, requestId: string): Promise<ArtifactRun>;
	cancel(runId: string): Promise<void>;
	reconcile(runId: string): Promise<void>;
	/** Newest first. The optional cursor is the preceding page's last run ID; page size is 1-200. */
	getRuns(before?: string, limit?: number): Promise<{ readonly runs: readonly ArtifactRun[]; readonly next?: string }>;
	acquireDetails(integrationId: string, detailsId: string): Promise<IArtifactDetailsModel>;
}

export interface IArtifactIntegrationAccess {
	acquireArtifact(session: string, artifactId: string): Promise<IReference<IArtifactModel>>;
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
