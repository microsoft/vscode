/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status as ariaStatus } from '../../../../../../base/browser/ui/aria/aria.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { deriveLocalModelReadiness, LocalModelEnabledSettingId, type ILocalModelFamilyV1, type ILocalModelOperationV1, type ILocalModelStatusV1, type LocalModelReadiness } from '../../../../../../platform/agentHost/common/localModel.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ILocalModelService } from '../../../../../services/agentHost/common/localModelService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID } from './localModelSetupFlow.js';

/** Context keys of the on-device model flow, from the status the current chat's local Agent Host publishes; all `false` unless the setting is on and the focused chat is a local Copilot agent-host chat. */
export namespace LocalModelContextKeys {
	export const visible = new RawContextKey<boolean>('chatLocalModelVisible', false, { type: 'boolean', description: localize('chatLocalModelVisible', "True when the current chat runs on the local agent host and it lists on-device models.") });
	export const canSetUp = new RawContextKey<boolean>('chatLocalModelCanSetUp', false, { type: 'boolean', description: localize('chatLocalModelCanSetUp', "True when an on-device model can be set up.") });
	export const hasOperation = new RawContextKey<boolean>('chatLocalModelHasOperation', false, { type: 'boolean', description: localize('chatLocalModelHasOperation', "True when an on-device model operation is running or paused.") });
	export const hasPausedOperation = new RawContextKey<boolean>('chatLocalModelHasPausedOperation', false, { type: 'boolean', description: localize('chatLocalModelHasPausedOperation', "True when an on-device model operation is paused.") });
	export const hasFailedOperation = new RawContextKey<boolean>('chatLocalModelHasFailedOperation', false, { type: 'boolean', description: localize('chatLocalModelHasFailedOperation', "True when an on-device model operation failed.") });
	export const hasInstalled = new RawContextKey<boolean>('chatLocalModelHasInstalled', false, { type: 'boolean', description: localize('chatLocalModelHasInstalled', "True when an on-device model is installed.") });
	export const hasUpdate = new RawContextKey<boolean>('chatLocalModelHasUpdate', false, { type: 'boolean', description: localize('chatLocalModelHasUpdate', "True when an installed on-device model has an update.") });
	export const active = new RawContextKey<boolean>('chatLocalModelActive', false, { type: 'boolean', description: localize('chatLocalModelActive', "True when an on-device model is active.") });
}

/** Values of {@link LocalModelContextKeys}. */
export interface ILocalModelContextKeyValues {
	readonly visible: boolean;
	readonly canSetUp: boolean;
	readonly hasOperation: boolean;
	readonly hasPausedOperation: boolean;
	readonly hasFailedOperation: boolean;
	readonly hasInstalled: boolean;
	readonly hasUpdate: boolean;
	readonly active: boolean;
}

function canSetUp(family: ILocalModelFamilyV1): boolean {
	return !family.install && !family.operation && (!!family.offer || !!family.entry?.modelFilesPresent);
}

/** Computes {@link ILocalModelContextKeyValues}; `undefined` status (gated off, remote, no provider) is all `false`. */
export function computeLocalModelContextKeyValues(status: ILocalModelStatusV1 | undefined): ILocalModelContextKeyValues {
	const families = status?.families ?? [];
	const operations = families.map(family => family.operation).filter((operation): operation is ILocalModelOperationV1 => !!operation);
	return {
		visible: families.length > 0,
		canSetUp: families.some(canSetUp),
		hasOperation: operations.some(operation => operation.state === 'running' || operation.state === 'paused'),
		hasPausedOperation: operations.some(operation => operation.state === 'paused'),
		hasFailedOperation: operations.some(operation => operation.state === 'error'),
		hasInstalled: families.some(family => !!family.install),
		hasUpdate: families.some(family => !!family.install?.update),
		active: !!status?.active,
	};
}

/** Binds {@link LocalModelContextKeys} for the focused chat; resets them when disposed. */
export class LocalModelContextKeysContribution extends Disposable {

	constructor(
		@IAgentHostService connection: IAgentHostService,
		@ILocalModelService localModelService: ILocalModelService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const setting = observableConfigValue<boolean>(LocalModelEnabledSettingId, false, configurationService);
		const localChat = observableFromEvent(this, Event.any<unknown>(chatWidgetService.onDidChangeFocusedWidget, chatWidgetService.onDidChangeFocusedSession), () => {
			const sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
			return !!sessionResource && getChatSessionType(sessionResource) === SessionType.AgentHostCopilot;
		});
		const status = localModelService.getStatus(connection);
		const values = derived(this, reader => computeLocalModelContextKeyValues(setting.read(reader) === true && localChat.read(reader) ? status.read(reader) : undefined));
		const bind = (key: RawContextKey<boolean>, read: (value: ILocalModelContextKeyValues) => boolean) => {
			const bound = key.bindTo(contextKeyService);
			this._register(autorun(reader => bound.set(read(values.read(reader)))));
			this._register(toDisposable(() => bound.reset()));
		};
		bind(LocalModelContextKeys.visible, value => value.visible);
		bind(LocalModelContextKeys.canSetUp, value => value.canSetUp);
		bind(LocalModelContextKeys.hasOperation, value => value.hasOperation);
		bind(LocalModelContextKeys.hasPausedOperation, value => value.hasPausedOperation);
		bind(LocalModelContextKeys.hasFailedOperation, value => value.hasFailedOperation);
		bind(LocalModelContextKeys.hasInstalled, value => value.hasInstalled);
		bind(LocalModelContextKeys.hasUpdate, value => value.hasUpdate);
		bind(LocalModelContextKeys.active, value => value.active);
	}
}

// #region Commands

/** Command ids of {@link registerLocalModelActions}. */
export const LocalModelCommandIds = {
	setUp: 'workbench.action.chat.localModel.setUp',
	cancel: 'workbench.action.chat.localModel.cancel',
	resume: 'workbench.action.chat.localModel.resume',
	retry: 'workbench.action.chat.localModel.retry',
	makeActive: 'workbench.action.chat.localModel.makeActive',
	update: 'workbench.action.chat.localModel.update',
	start: 'workbench.action.chat.localModel.start',
	stop: 'workbench.action.chat.localModel.stop',
	remove: 'workbench.action.chat.localModel.remove',
} as const;

/** Optional target of a command: a family id or operation id string, or an object with either. */
export interface ILocalModelCommandTarget {
	readonly familyId?: string;
	readonly operationId?: string;
}

function readTarget(arg: unknown): ILocalModelCommandTarget {
	if (typeof arg === 'string') {
		return { familyId: arg, operationId: arg };
	}
	if (arg && typeof arg === 'object') {
		const target: { familyId?: unknown; operationId?: unknown } = arg;
		return {
			familyId: typeof target.familyId === 'string' ? target.familyId : undefined,
			operationId: typeof target.operationId === 'string' ? target.operationId : undefined,
		};
	}
	return {};
}

function readinessLabel(readiness: LocalModelReadiness | undefined): string | undefined {
	switch (readiness) {
		case 'preparing': return localize('localModel.pick.preparing', "Setting up");
		case 'paused': return localize('localModel.pick.paused', "Paused");
		case 'error': return localize('localModel.pick.error', "Failed");
		case 'ready': return localize('localModel.pick.ready', "Ready");
		case 'installed': return localize('localModel.pick.installed', "Installed");
		case 'requiresSetup': return localize('localModel.pick.requiresSetup', "Not set up");
		default: return undefined;
	}
}

/** Picks the family a command applies to: the one `target` names, the only candidate, or the user's quick pick choice. */
async function pickFamily(accessor: ServicesAccessor, status: ILocalModelStatusV1, candidates: readonly ILocalModelFamilyV1[], target: ILocalModelCommandTarget, placeHolder: string): Promise<ILocalModelFamilyV1 | undefined> {
	if (target.familyId || target.operationId) {
		return candidates.find(family => family.familyId === target.familyId || (!!target.operationId && family.operation?.id === target.operationId));
	}
	if (candidates.length <= 1) {
		return candidates[0];
	}
	const items: (IQuickPickItem & { readonly family: ILocalModelFamilyV1 })[] = candidates.map(family => ({
		label: family.displayName,
		description: readinessLabel(deriveLocalModelReadiness(family, status)),
		family,
	}));
	const picked = await accessor.get(IQuickInputService).pick(items, { placeHolder });
	return picked?.family;
}

interface ILocalModelCommandContext {
	readonly connection: IAgentHostService;
	readonly localModelService: ILocalModelService;
	readonly status: ILocalModelStatusV1;
}

/** An on-device model command: Command Palette, category Chat, enabled only while chat is enabled, the on-device rows are visible and its own precondition holds. */
abstract class LocalModelAction extends Action2 {
	constructor(id: string, title: { value: string; original: string }, precondition: ContextKeyExpression) {
		super({
			id,
			title,
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, LocalModelContextKeys.visible, precondition),
		});
	}

	override async run(accessor: ServicesAccessor, arg?: unknown): Promise<void> {
		const connection = accessor.get(IAgentHostService);
		const localModelService = accessor.get(ILocalModelService);
		const status = localModelService.getStatus(connection).get();
		if (status) {
			await this.runWithStatus(accessor, { connection, localModelService, status }, readTarget(arg));
		}
	}

	protected abstract runWithStatus(accessor: ServicesAccessor, context: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void>;
}

/** Registers the on-device model Command Palette commands (each taking an optional family or operation id) and the internal {@link LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID}. */
export function registerLocalModelActions(): void {
	registerAction2(class SetUpLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.setUp, localize2('localModel.command.setUp', "Set Up On-Device Model…"), LocalModelContextKeys.canSetUp);
		}
		/** The consent is given on the family's detail page in the model picker. */
		protected async runWithStatus(accessor: ServicesAccessor, { status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const commandService = accessor.get(ICommandService);
			const family = await pickFamily(accessor, status, status.families.filter(canSetUp), target, localize('localModel.pick.setUp', "Select an on-device model to set up"));
			if (family) {
				await commandService.executeCommand(LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID, family.familyId);
			}
		}
	});

	registerAction2(class CancelLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.cancel, localize2('localModel.command.cancel', "Cancel On-Device Model Download"), LocalModelContextKeys.hasOperation);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const family = await pickFamily(accessor, status, status.families.filter(candidate => candidate.operation?.state === 'running'), target, localize('localModel.pick.cancel', "Select the on-device model operation to cancel"));
			const operation = family?.operation;
			if (!operation) {
				return;
			}
			if (operation.phase === 'draining') {
				await localModelService.stopNow(connection);
			} else {
				localModelService.cancel(connection, operation.id);
			}
		}
	});

	registerAction2(class ResumeLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.resume, localize2('localModel.command.resume', "Resume On-Device Model Download"), LocalModelContextKeys.hasPausedOperation);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const commandService = accessor.get(ICommandService);
			const family = await pickFamily(accessor, status, status.families.filter(candidate => candidate.operation?.state === 'paused'), target, localize('localModel.pick.resume', "Select the on-device model download to resume"));
			const operation = family?.operation;
			if (!family || !operation) {
				return;
			}
			// A changed download needs consent again, which its detail page asks for.
			if (operation.pausedReason === 'consentChanged') {
				await commandService.executeCommand(LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID, family.familyId);
			} else {
				localModelService.resume(connection, operation.id);
			}
		}
	});

	registerAction2(class RetryLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.retry, localize2('localModel.command.retry', "Retry On-Device Model Setup"), LocalModelContextKeys.hasFailedOperation);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const family = await pickFamily(accessor, status, status.families.filter(candidate => candidate.operation?.state === 'error'), target, localize('localModel.pick.retry', "Select the on-device model operation to retry"));
			if (family?.operation) {
				localModelService.retry(connection, family.operation.id);
			}
		}
	});

	registerAction2(class MakeLocalModelActiveAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.makeActive, localize2('localModel.command.makeActive', "Make On-Device Model Active…"), LocalModelContextKeys.hasInstalled);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const candidates = status.families.filter(family => !!family.install && family.familyId !== status.active?.familyId);
			const family = await pickFamily(accessor, status, candidates, target, localize('localModel.pick.makeActive', "Select the on-device model to load"));
			if (family) {
				localModelService.makeActive(connection, family.familyId);
			}
		}
	});

	registerAction2(class UpdateLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.update, localize2('localModel.command.update', "Update On-Device Model"), LocalModelContextKeys.hasUpdate);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const family = await pickFamily(accessor, status, status.families.filter(candidate => !!candidate.install?.update), target, localize('localModel.pick.update', "Select the on-device model to update"));
			if (family) {
				localModelService.update(connection, family.familyId);
			}
		}
	});

	registerAction2(class StartLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.start, localize2('localModel.command.start', "Start On-Device Model"), LocalModelContextKeys.active);
		}
		protected async runWithStatus(_accessor: ServicesAccessor, { connection, localModelService }: ILocalModelCommandContext): Promise<void> {
			localModelService.start(connection);
		}
	});

	registerAction2(class StopLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.stop, localize2('localModel.command.stop', "Stop On-Device Model"), LocalModelContextKeys.active);
		}
		protected async runWithStatus(_accessor: ServicesAccessor, { connection, localModelService }: ILocalModelCommandContext): Promise<void> {
			localModelService.stop(connection);
		}
	});

	registerAction2(class RemoveLocalModelAction extends LocalModelAction {
		constructor() {
			super(LocalModelCommandIds.remove, localize2('localModel.command.remove', "Remove On-Device Model…"), ContextKeyExpr.or(LocalModelContextKeys.hasInstalled, LocalModelContextKeys.hasOperation)!);
		}
		protected async runWithStatus(accessor: ServicesAccessor, { connection, localModelService, status }: ILocalModelCommandContext, target: ILocalModelCommandTarget): Promise<void> {
			const candidates = status.families.filter(family => !!family.install || !!family.operation);
			const family = await pickFamily(accessor, status, candidates, target, localize('localModel.pick.remove', "Select the on-device model to remove"));
			if (family) {
				await localModelService.remove(connection, family.familyId);
			}
		}
	});

	registerAction2(class ShowLocalModelDetailsAction extends Action2 {
		constructor() {
			super({
				id: LOCAL_MODEL_SHOW_DETAILS_COMMAND_ID,
				title: localize2('localModel.command.showDetails', "Show On-Device Model Details"),
				category: CHAT_CATEGORY,
				f1: false,
				precondition: ChatContextKeys.enabled,
			});
		}
		override async run(accessor: ServicesAccessor, familyId?: unknown): Promise<void> {
			if (typeof familyId !== 'string') {
				return;
			}
			const logService = accessor.get(ILogService);
			if (!await showLocalModelDetails(accessor.get(IChatWidgetService), familyId, logService)) {
				logService.info(`[LocalModel] Could not show the details of '${familyId}': no chat on the local agent host can show on-device models`);
				ariaStatus(localize('localModel.showDetails.unavailable', "On-device model details can't be shown: no chat that runs on this device's agent host is available."));
			}
		}
	});
}

/** Whether the chat of `widget` runs on the local Copilot Agent Host, whose model picker lists on-device models. */
function showsOnDeviceModels(widget: IChatWidget | undefined): widget is IChatWidget {
	const sessionResource = widget?.viewModel?.sessionResource;
	return !!sessionResource && getChatSessionType(sessionResource) === SessionType.AgentHostCopilot;
}

/**
 * Opens the model picker of the most relevant chat input that lists on-device models (last focused, else any open,
 * else a new local Copilot chat) on its "On This Device" tab at `familyId`'s detail page. Resolves whether it opened.
 */
export async function showLocalModelDetails(chatWidgetService: IChatWidgetService, familyId: string, logService: ILogService): Promise<boolean> {
	const lastFocused = chatWidgetService.lastFocusedWidget;
	let widget = showsOnDeviceModels(lastFocused) ? lastFocused : chatWidgetService.getAllWidgets().find(showsOnDeviceModels);
	if (widget) {
		await chatWidgetService.reveal(widget);
	} else {
		// Like a new chat of that session type: an untitled session on the local Copilot Agent Host.
		try {
			widget = await chatWidgetService.openSession(URI.from({ scheme: SessionType.AgentHostCopilot, path: `/untitled-${generateUuid()}` }));
		} catch (error) {
			logService.error('[LocalModel] Could not start a chat on the local agent host to show on-device model details', error);
			return false;
		}
	}
	const control = showsOnDeviceModels(widget) ? widget.input.getModelPickerControl() : undefined;
	if (!control) {
		return false;
	}
	control.open({ localModelFamilyId: familyId });
	return true;
}

// #endregion
