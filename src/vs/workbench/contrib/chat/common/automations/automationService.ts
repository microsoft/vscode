/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { stableStringify } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatPermissionLevel } from '../constants.js';
import { IAutomationDescriptor, IAutomationRun, IAutomationSchedule, IAutomationSessionTemplate, AutomationTarget } from './automation.js';

export const IAutomationService = createDecorator<IAutomationService>('automationService');
export const ConfigureAutomationToolReferenceName = 'configureAutomation';

/** Catalogue completeness; only `ready` makes an empty snapshot authoritative. */
export type AutomationCatalogueState = 'loading' | 'ready' | 'unavailable' | 'error';

export function combineAutomationCatalogueStates(states: readonly AutomationCatalogueState[]): AutomationCatalogueState {
	if (states.includes('error')) {
		return 'error';
	}
	if (states.includes('loading')) {
		return 'loading';
	}
	if (states.includes('unavailable')) {
		return 'unavailable';
	}
	return 'ready';
}

/**
 * A caller-supplied check immediately before a definition mutation is dispatched; throwing prevents dispatch.
 * Rechecks transient client conditions, not host authorization or editable-state conflicts.
 */
export type AutomationMutationGuard = () => void;

/** The selected Automation authority cannot currently accept the operation. */
export class AutomationUnavailableError extends Error { }

/** Rejects ownership changes because AHP has no history-preserving cross-host transfer operation. */
export function assertAutomationTargetAuthority(current: IAutomationDescriptor, target: AutomationTarget | undefined): void {
	if (target !== undefined && target.providerId !== current.target.providerId) {
		throw new AutomationUnavailableError(localize('automationHostChangeUnsupported', "An automation cannot move between Agent Hosts. Duplicate it on the new host to keep the original run history. The original continues scheduling until you disable it."));
	}
}

/** Signals that deprecated configuration aliases cannot modify an explicit provider template. */
export class AutomationSessionTemplateAuthorityError extends Error {
	constructor() {
		super('A canonical Automation session template cannot be updated through legacy configuration aliases.');
	}
}

export function assertAutomationSessionTemplateAuthority(current: IAutomationDescriptor, patch: IUpdateAutomationOptions): void {
	const targetAuthorityChanged = patch.target !== undefined
		&& (patch.target.providerId !== current.target.providerId || patch.target.sessionTypeId !== current.target.sessionTypeId);
	const legacyConfigurationPatched = patch.modelId !== undefined || patch.mode !== undefined || patch.permissionLevel !== undefined;
	if (current.sessionTemplate && patch.sessionTemplate === undefined && !targetAuthorityChanged && legacyConfigurationPatched) {
		throw new AutomationSessionTemplateAuthorityError();
	}
}

/**
 * Input for `createAutomation`. The service fills in `id`, timestamps, and
 * `nextRunAt`.
 */
export interface ICreateAutomationOptions {
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
	readonly target: AutomationTarget;
	readonly sessionTemplate?: IAutomationSessionTemplate;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly modelId?: string;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly mode?: string;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly permissionLevel?: string;
	readonly enabled?: boolean;
}

/**
 * Patch for `updateAutomation`. Absent fields are unchanged; a target change
 * replaces the complete discriminated target atomically.
 */
export interface IUpdateAutomationOptions {
	readonly name?: string;
	readonly prompt?: string;
	readonly schedule?: IAutomationSchedule;
	readonly target?: AutomationTarget;
	readonly sessionTemplate?: IAutomationSessionTemplate | null;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly modelId?: string | null;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly mode?: string | null;
	/** @deprecated Compatibility input translated into {@link sessionTemplate}. */
	readonly permissionLevel?: string | null;
	readonly enabled?: boolean;
}

/**
 * Result of an optimistic automation update.
 * `current` is absent when the automation was deleted before the update committed.
 */
export type IGuardedAutomationUpdateResult =
	| { readonly kind: 'updated'; readonly automation: IAutomationDescriptor }
	| { readonly kind: 'conflict'; readonly current: IAutomationDescriptor | undefined };

/**
 * Returns the canonical editable state used by optimistic automation updates.
 * Runtime-only timestamps are intentionally excluded. Workspace URIs use their
 * canonical serialized form so any mismatch fails closed as a conflict.
 */
export function serializeAutomationEditableState(automation: IAutomationDescriptor): string {
	const target = automation.target.kind === 'quickChat'
		? {
			kind: automation.target.kind,
			providerId: automation.target.providerId,
			sessionTypeId: automation.target.sessionTypeId,
		}
		: {
			kind: automation.target.kind,
			folderUri: automation.target.folderUri.toString(),
			providerId: automation.target.providerId,
			sessionTypeId: automation.target.sessionTypeId,
			isolation: automation.target.isolation.kind === 'worktree'
				? { kind: automation.target.isolation.kind, branch: automation.target.isolation.branch }
				: { kind: automation.target.isolation.kind },
		};
	return stableStringify({
		name: automation.name,
		prompt: automation.prompt,
		schedule: {
			interval: automation.schedule.interval,
			scheduleHour: automation.schedule.scheduleHour,
			scheduleMinute: automation.schedule.scheduleMinute,
			scheduleDay: automation.schedule.scheduleDay,
		},
		target,
		sessionTemplate: automation.sessionTemplate,
		modelId: automation.modelId,
		mode: automation.mode,
		permissionLevel: automation.permissionLevel ?? ChatPermissionLevel.Default,
		enabled: automation.enabled,
	});
}

/** Result of requesting a manual run from its host, never a claim authorizing client-side execution. */
export type IAutomationRunRequestResult =
	/** An existing run already occupies this Automation's active-run slot. */
	| { readonly kind: 'alreadyRunning'; readonly run: IAutomationRun }
	| {
		/** The host handled the request, possibly failing before creating a session. */
		readonly kind: 'dispatched';
		readonly run: IAutomationRun;
		/** Resolves on a terminal host outcome, not necessarily success; rejects if observation fails. */
		readonly whenCompleted: Promise<void>;
		/** Requests host cancellation when the negotiated capability supports it. */
		cancel?(): void;
	};

/**
 * Provider-neutral catalogue and command contract shared by individual providers and the aggregate service.
 * Reads projected state and requests host mutations; it does not grant browser persistence or execution authority.
 */
export interface IAutomationStore {
	/** Completeness of the Automation catalogue, independent of individual providers' operation availability. */
	readonly catalogueState: IObservable<AutomationCatalogueState>;

	/** All defined automations, newest first. */
	readonly automations: IObservable<readonly IAutomationDescriptor[]>;

	/** All recorded runs across all automations, newest first. */
	readonly runs: IObservable<readonly IAutomationRun[]>;

	/** Snapshot accessor (no observable dependency). */
	getAutomation(id: string): IAutomationDescriptor | undefined;

	/** Runs for a single automation, newest first. */
	runsFor(automationId: string): IObservable<readonly IAutomationRun[]>;
	/** Creates and persists an automation after validating the complete definition. */
	createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor>;
	/** Applies a patch to the latest automation state; throws when `id` does not exist. */
	updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor>;
	/**
	 * Applies `patch` only when the current editable fields still match `expected`.
	 * Runtime timestamps may change without conflicting, so reviewed edits preserve scheduler progress.
	 */
	updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult>;
	/** Deletes an automation and its retained run history; missing IDs are ignored. */
	deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void>;

	/** Requests a manual run, forwarding supported cancellation after admission even while session creation is pending. */
	runAutomation(automationId: string, token?: CancellationToken): Promise<IAutomationRunRequestResult>;

	/** Most recent `pending`/`running` run for an automation, or `undefined`. */
	getActiveRunFor(automationId: string): IAutomationRun | undefined;

	canRunAutomation(automationId: string): boolean;
	canUpdateAutomation(automationId: string): boolean;
	canDeleteAutomation(automationId: string): boolean;
}

/**
 * Injectable, application-wide Automation facade combining registered providers' catalogues and availability.
 * Routes creation by target provider and existing-definition operations by provider-scoped identity.
 */
export interface IAutomationService extends IAutomationStore {
	readonly _serviceBrand: undefined;
	/** Providers whose Automation catalogues are currently unavailable. */
	readonly unavailableProviders: IObservable<readonly IAutomationProviderDescriptor[]>;
	/** Creation-capable providers; existing definitions may allow edits on providers absent from this list. */
	readonly availableProviders: IObservable<readonly IAutomationProviderDescriptor[]>;
	/** Whether the specified provider currently accepts new definitions. */
	canCreateAutomation(providerId: string | undefined): boolean;
}

/** Identity and optional unavailability explanation of a concrete Automation provider. */
export interface IAutomationProviderDescriptor {
	readonly id: string;
	readonly label: string;
	/** A provider-specific explanation, absent when none applies. */
	readonly unavailableReason?: string;
}
