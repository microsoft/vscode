/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { isObject } from '../../../../base/common/types.js';
import { MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, isOnboardingTargetScope, OnboardingTryoutAvailability, OnboardingTryoutPreparation, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';
import { ICommandTryoutPayload, isCommandTryoutPayload, isViewTryoutPayload, IViewTryoutPayload } from '../common/onboardingTryoutActions.js';

export class CommandTryoutPresentation implements IOnboardingTryoutPresentationDefinition<ICommandTryoutPayload> {
	readonly kind = 'command';
	readonly isPayload = isCommandTryoutPayload;
	readonly onDidChangeAvailability: Event<void>;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		this.onDidChangeAvailability = Event.any(
			Event.map(contextKeyService.onDidChangeContext, () => undefined),
			Event.map(CommandsRegistry.onDidRegisterCommand, () => undefined),
		);
	}

	getAvailability(payload: ICommandTryoutPayload): OnboardingTryoutAvailability {
		const precondition = MenuRegistry.getCommand(payload.commandId)?.precondition;
		if (payload.commandId === RUN_ONBOARDING_TRYOUT_COMMAND_ID
			|| !CommandsRegistry.getCommand(payload.commandId)
			|| (precondition && !this.contextKeyService.contextMatchesRules(precondition))) {
			return { kind: 'unavailable', message: localize('onboarding.tryout.commandUnavailable', "This command is not available in the current context.") };
		}
		return { kind: 'ready' };
	}

	async prepare(payload: ICommandTryoutPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		return {
			kind: 'ready',
			run: async () => {
				if (context.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				const availability = this.getAvailability(payload);
				if (availability.kind === 'unavailable') {
					return availability;
				}
				const result = await this.commandService.executeCommand(payload.commandId, ...(payload.arguments ?? []));
				if (!payload.captureTargetScope) {
					return { kind: 'executed' };
				}
				const targetScope = isObject(result)
					? (result as { readonly targetScope?: unknown }).targetScope
					: undefined;
				if (!isOnboardingTargetScope(targetScope)) {
					return { kind: 'unavailable', message: localize('onboarding.tryout.targetUnavailable', "The example opened, but its target is no longer available.") };
				}
				return { kind: 'executed', targetScope };
			},
		};
	}
}

export class ViewTryoutPresentation implements IOnboardingTryoutPresentationDefinition<IViewTryoutPayload> {
	readonly kind = 'openView';
	readonly isPayload = isViewTryoutPayload;
	readonly onDidChangeAvailability: Event<void>;

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		this.onDidChangeAvailability = Event.any(
			Event.map(viewDescriptorService.onDidChangeViewContainers, () => undefined),
			Event.map(viewDescriptorService.onDidChangeContainer, () => undefined),
			Event.map(contextKeyService.onDidChangeContext, () => undefined),
		);
	}

	getAvailability(payload: IViewTryoutPayload): OnboardingTryoutAvailability {
		const descriptor = payload.target === 'view' ? this.viewDescriptorService.getViewDescriptorById(payload.id) : undefined;
		const available = payload.target === 'view'
			? descriptor && (!descriptor.when || this.contextKeyService.contextMatchesRules(descriptor.when))
			: this.viewDescriptorService.getViewContainerById(payload.id);
		return available
			? { kind: 'ready' }
			: { kind: 'unavailable', message: localize('onboarding.tryout.viewUnavailable', "This view is not available in the current window.") };
	}

	async prepare(payload: IViewTryoutPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		return {
			kind: 'ready',
			run: async () => {
				if (context.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				const availability = this.getAvailability(payload);
				if (availability.kind === 'unavailable') {
					return availability;
				}
				const view = payload.target === 'view'
					? await this.viewsService.openView(payload.id, payload.focus ?? true)
					: await this.viewsService.openViewContainer(payload.id, payload.focus ?? true);
				return view
					? { kind: 'opened' }
					: { kind: 'unavailable', message: localize('onboarding.tryout.viewFailed', "The example's view could not be opened.") };
			},
		};
	}
}
