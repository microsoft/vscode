/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, isObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { vObj, vOptionalProp, vString, type IValidator, type ValidatorType } from '../../../../base/common/validation.js';
import { localize } from '../../../../nls.js';
import { isAgentHostCanvasJson, type AgentHostCanvasJson, type IAgentHostCanvasDefinition, type IAgentHostCanvasInstance, type IAgentHostCanvasState } from '../../../../platform/agentHost/common/agentHostCanvases.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { SessionStatus, type IChat } from '../../../services/sessions/common/session.js';
import { ISessionCanvasService, type ISessionCanvasTarget } from './sessionCanvasService.js';

export const SessionCanvasCommands = {
	manage: 'workbench.action.sessions.canvas.manage',
	open: 'workbench.action.sessions.canvas.open',
	reveal: 'workbench.action.sessions.canvas.reveal',
	invokeAction: 'workbench.action.sessions.canvas.invokeAction',
	close: 'workbench.action.sessions.canvas.close',
	refresh: 'workbench.action.sessions.canvas.refresh',
	reload: 'workbench.action.sessions.canvas.reload',
	getState: 'workbench.action.sessions.canvas.getState',
} as const;

export type SessionCanvasOperation = keyof typeof SessionCanvasCommands;

const jsonValidator: IValidator<AgentHostCanvasJson> = {
	validate: content => isAgentHostCanvasJson(content)
		? { content, error: undefined }
		: { content: undefined, error: { message: localize('canvas.jsonRequired', "Canvas input must be valid JSON.") } },
	getJSONSchema: () => ({}),
};

const commandArguments = vObj({
	sessionResource: vString(),
	chatResource: vString(),
	extensionId: vOptionalProp(vString()),
	canvasId: vOptionalProp(vString()),
	instanceId: vOptionalProp(vString()),
	actionName: vOptionalProp(vString()),
	input: vOptionalProp(jsonValidator),
});

type CanvasCommandArguments = ValidatorType<typeof commandArguments>;
type CanvasPick = IQuickPickItem & { readonly id: string } & (
	| { readonly kind: 'instance'; readonly instance: IAgentHostCanvasInstance }
	| { readonly kind: 'definition'; readonly definition: IAgentHostCanvasDefinition }
	| { readonly kind: 'refresh' | 'reload' | 'openPackage' }
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SessionCanvasActions {
	constructor(
		@ISessionCanvasService private readonly canvasService: ISessionCanvasService,
		@ISessionContext private readonly sessionContext: ISessionContext,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async run(operation: SessionCanvasOperation, context?: unknown): Promise<URI | AgentHostCanvasJson | IAgentHostCanvasState | undefined | void> {
		const { target, args } = this.resolveTarget(context);
		switch (operation) {
			case 'manage':
				return this.manage(target);
			case 'getState':
				return target.canvases.refresh();
			case 'refresh':
				return this.canvasService.refresh(target);
			case 'reload':
				return this.canvasService.reload(target);
			case 'open':
				return this.open(target, args);
			case 'invokeAction':
				return this.invokeAction(target, args);
			case 'reveal': {
				const instanceId = await this.pickInstance(target, args);
				return instanceId ? this.canvasService.reveal(target, instanceId) : undefined;
			}
			case 'close': {
				const instanceId = await this.pickInstance(target, args);
				return instanceId ? this.canvasService.close(target, instanceId) : undefined;
			}
		}
	}

	private resolveTarget(context: unknown): { target: ISessionCanvasTarget; args?: CanvasCommandArguments } {
		if (context === undefined) {
			const session = this.sessionContext.session.get();
			if (!session) {
				throw new Error(localize('canvas.selectChat', "Select a local canvas chat first."));
			}
			return { target: this.canvasService.getTarget(session.resource, session.activeChat.get().resource) };
		}
		const parsed = commandArguments.validate(context);
		if (!parsed.error) {
			return {
				target: this.canvasService.getTarget(URI.parse(parsed.content.sessionResource, true), URI.parse(parsed.content.chatResource, true)),
				args: parsed.content,
			};
		}
		if (isRecord(context) && (context.sessionResource !== undefined || context.chatResource !== undefined)) {
			throw new Error(localize('canvas.invalidArguments', "Canvas command arguments are invalid: {0}", parsed.error.message));
		}
		if (isRecord(context) && URI.isUri(context.resource) && isObservable<IChat>(context.activeChat)) {
			return { target: this.canvasService.getTarget(context.resource, context.activeChat.get().resource) };
		}
		throw new Error(localize('canvas.invalidTarget', "Canvas commands require sessionResource and chatResource identifying the owning chat."));
	}

	private async manage(target: ISessionCanvasTarget): Promise<void> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<CanvasPick>({ useSeparators: true }));
		picker.title = localize('canvas.pickerTitle', "Canvases — {0}", target.chat.title.get());
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;
		picker.keepScrollPosition = true;
		const items = derivedOpts<QuickPickInput<CanvasPick>[]>({ owner: store, equalsFn: structuralEquals }, reader =>
			this.canvasService.enabled.read(reader) ? this.pickerItems(target.canvases.state.read(reader)) : []);
		let initialized = false;
		store.add(autorun(reader => {
			const next = items.read(reader);
			const activeIds = new Set(picker.activeItems.map(item => item.id));
			const selectedIds = new Set(picker.selectedItems.map(item => item.id));
			picker.items = next;
			if (initialized) {
				const choices = next.filter((item): item is CanvasPick => item.type !== 'separator');
				picker.activeItems = choices.filter(item => activeIds.has(item.id));
				picker.selectedItems = choices.filter(item => selectedIds.has(item.id));
			}
			initialized = true;
		}));
		store.add(autorun(reader => {
			if (!this.canvasService.enabled.read(reader)) {
				picker.busy = false;
				picker.placeholder = localize('canvas.pickerDisabled', "Local canvases are disabled. Enable the local canvases preview and AI features in Settings before retrying.");
				return;
			}
			const state = target.canvases.state.read(reader);
			const error = target.canvases.error.read(reader);
			picker.busy = target.canvases.loading.read(reader);
			picker.placeholder = error
				? localize('canvas.pickerError', "The canvas provider could not complete the request. Refresh to retry.")
				: state.catalog.length || state.instances.length
					? localize('canvas.pickerHint', "Open a canvas, reveal a hidden instance, or manage its actions")
					: localize('canvas.pickerEmpty', "No canvases are available. Refresh or restart the local provider.");
		}));
		let selected: CanvasPick | undefined;
		try {
			const selection = new Promise<CanvasPick | undefined>(resolve => {
				store.add(picker.onDidAccept(() => {
					const selected = picker.selectedItems[0];
					if (selected && picker.activeItems.some(item => item.id === selected.id)) {
						resolve(selected);
					}
				}));
				store.add(picker.onDidHide(() => resolve(undefined)));
			});
			picker.show();
			if (target.chat.status.get() !== SessionStatus.Untitled) {
				void target.canvases.refresh().catch(() => { /* Shown by the observable picker state. */ });
			}
			selected = await selection;
		} finally {
			picker.hide();
			store.dispose();
		}
		if (!selected) {
			return;
		}
		switch (selected.kind) {
			case 'definition':
				await this.openDefinition(target, selected.definition);
				break;
			case 'instance':
				await this.manageInstance(target, selected.instance);
				break;
			case 'refresh':
				await this.canvasService.refresh(target);
				await this.manage(target);
				break;
			case 'reload':
				await this.canvasService.reload(target);
				await this.manage(target);
				break;
			case 'openPackage':
				await this.openPackage(target);
				break;
		}
	}

	private pickerItems(state: IAgentHostCanvasState): QuickPickInput<CanvasPick>[] {
		const items: QuickPickInput<CanvasPick>[] = [];
		if (state.instances.length) {
			items.push({ type: 'separator', label: localize('canvas.instances', "Instances (including hidden tabs)") });
			for (const instance of state.instances) {
				const definition = state.catalog.find(canvas => canvas.extensionId === instance.extensionId && canvas.canvasId === instance.canvasId);
				items.push({
					id: JSON.stringify(['instance', instance.extensionId, instance.canvasId, instance.instanceId]),
					kind: 'instance', instance,
					label: definition?.displayName ?? instance.canvasId,
					description: instance.instanceId,
					detail: instance.availability === 'ready'
						? localize('canvas.instanceReady', "Ready — reveal, run an action, or close this instance")
						: localize('canvas.instanceUnavailable', "Unavailable — restart the provider and retry; the logical instance is retained"),
				});
			}
		}
		if (state.catalog.length) {
			items.push({ type: 'separator', label: localize('canvas.catalog', "Open a new canvas") });
			items.push(...state.catalog.map((definition): CanvasPick => ({
				id: JSON.stringify(['definition', definition.extensionId, definition.canvasId]),
				kind: 'definition', definition, label: definition.displayName,
				description: definition.extensionId, detail: definition.description,
			})));
		}
		items.push({ type: 'separator' }, { id: 'refresh', kind: 'refresh', label: localize('canvas.refresh', "Refresh Canvases") });
		if (state.supported) {
			items.push({
				id: 'openPackage', kind: 'openPackage',
				label: localize('canvas.openPackage', "Open Canvas from Approved Package…"),
				detail: localize('canvas.openPackageDetail', "Choose a reviewed package and its declared canvas type. Code starts only after confirming the input."),
			});
			items.push({
				id: 'reload',
				kind: 'reload', label: localize('canvas.restart', "Restart Canvas Provider"),
				detail: localize('canvas.restartDetail', "Restart the opted-in local canvas runtime, then retry visible canvases"),
			});
		}
		return items;
	}

	private async manageInstance(target: ISessionCanvasTarget, instance: IAgentHostCanvasInstance): Promise<void> {
		const selection = await this.quickInputService.pick<IQuickPickItem & { operation: 'reveal' | 'invokeAction' | 'close' }>([
			{ label: localize('canvas.reveal', "Reveal Canvas"), operation: 'reveal' },
			{ label: localize('canvas.invoke', "Run Canvas Action"), operation: 'invokeAction' },
			{ label: localize('canvas.close', "Close Canvas"), operation: 'close', detail: localize('canvas.closeDetail', "Close the logical instance. Closing only its editor tab keeps it available here.") },
		], { title: localize('canvas.instanceActions', "Canvas — {0}", instance.instanceId) });
		if (selection?.operation === 'reveal') {
			await this.canvasService.reveal(target, instance.instanceId);
		} else if (selection?.operation === 'close') {
			await this.canvasService.close(target, instance.instanceId);
		} else if (selection?.operation === 'invokeAction') {
			await this.invokeAction(target, undefined, instance.instanceId);
		}
	}

	private async open(target: ISessionCanvasTarget, args: CanvasCommandArguments | undefined): Promise<URI | undefined> {
		if (args) {
			if (!args.extensionId || !args.canvasId) {
				throw new Error(localize('canvas.openArguments', "Opening a canvas requires extensionId and canvasId."));
			}
			return this.canvasService.open(target, { extensionId: args.extensionId, canvasId: args.canvasId, instanceId: args.instanceId ?? generateUuid(), input: args.input });
		}
		if (target.chat.status.get() === SessionStatus.Untitled) {
			return this.openPackage(target);
		}
		const state = await target.canvases.refresh();
		if (!state.catalog.length) {
			return this.openPackage(target);
		}
		const selected = await this.quickInputService.pick(state.catalog.map(definition => ({
			label: definition.displayName, description: definition.extensionId, detail: definition.description, definition,
		})), { title: localize('canvas.openTitle', "Open Canvas"), placeHolder: localize('canvas.selectDefinition', "Choose a canvas from the local catalog") });
		return selected ? this.openDefinition(target, selected.definition) : undefined;
	}

	private async openPackage(target: ISessionCanvasTarget): Promise<URI | undefined> {
		const workspace = target.session.workspace.get()?.folders[0]?.root;
		const packages = await target.canvases.getOpenPackages?.(workspace) ?? [];
		if (!packages.length) {
			this.notificationService.info(localize('canvas.noApprovedPackages', "No approved canvas packages are available. Use Manage Local Canvas Packages to prepare, review, and approve a package first."));
			return undefined;
		}
		const selected = await this.quickInputService.pick(packages.map(pkg => ({
			label: pkg.name, description: pkg.revision.slice(0, 12), pkg,
		})), { title: localize('canvas.openPackageTitle', "Open Canvas from Approved Package") });
		if (!selected) {
			return undefined;
		}
		const canvasId = await this.quickInputService.input({
			title: localize('canvas.typeTitle', "Canvas Type"),
			prompt: localize('canvas.typePrompt', "Enter the canvas id declared by this reviewed package (for example, starter). Discovering types would execute its backend."),
			validateInput: async value => value.trim() ? undefined : localize('canvas.typeRequired', "Enter a canvas type."),
		});
		if (canvasId === undefined) {
			return undefined;
		}
		const input = await this.readInput({});
		const current = await target.canvases.getOpenPackages?.(workspace) ?? [];
		if (!current.some(pkg => pkg.extensionId === selected.pkg.extensionId && pkg.revision === selected.pkg.revision)) {
			throw new CancellationError();
		}
		return this.canvasService.open(target, {
			extensionId: selected.pkg.extensionId, canvasId: canvasId.trim(), instanceId: generateUuid(), input,
		});
	}

	private async openDefinition(target: ISessionCanvasTarget, definition: IAgentHostCanvasDefinition): Promise<URI | undefined> {
		const input = await this.readInput(definition.inputSchema);
		return this.canvasService.open(target, {
			extensionId: definition.extensionId, canvasId: definition.canvasId, instanceId: generateUuid(), input,
		});
	}

	private async pickInstance(target: ISessionCanvasTarget, args: CanvasCommandArguments | undefined): Promise<string | undefined> {
		if (args) {
			if (!args.instanceId) {
				throw new Error(localize('canvas.instanceArgument', "This canvas command requires instanceId."));
			}
			return args.instanceId;
		}
		const state = await target.canvases.refresh();
		if (!state.instances.length) {
			this.notificationService.info(localize('canvas.emptyInstances', "This chat has no canvas instances. Open a canvas from the catalog first."));
			return undefined;
		}
		const selected = await this.quickInputService.pick(state.instances.map(instance => ({
			label: instance.canvasId, description: instance.instanceId, instance,
		})), { title: localize('canvas.chooseInstance', "Choose Canvas Instance"), placeHolder: localize('canvas.chooseInstanceHint', "Choose the instance belonging to this chat") });
		return selected?.instance.instanceId;
	}

	private async invokeAction(target: ISessionCanvasTarget, args?: CanvasCommandArguments, selectedInstanceId?: string): Promise<AgentHostCanvasJson | undefined> {
		const instanceId = selectedInstanceId ?? await this.pickInstance(target, args);
		if (!instanceId) {
			return undefined;
		}
		if (args) {
			if (!args.actionName) {
				throw new Error(localize('canvas.actionArgument', "Running a canvas action requires actionName."));
			}
			return this.canvasService.invokeAction(target, { instanceId, actionName: args.actionName, input: args.input });
		}
		const state = await target.canvases.refresh();
		const instance = state.instances.find(instance => instance.instanceId === instanceId);
		const definition = state.catalog.find(canvas => canvas.extensionId === instance?.extensionId && canvas.canvasId === instance.canvasId);
		if (!definition?.actions.length) {
			this.notificationService.info(localize('canvas.noActions', "This canvas has no declared actions."));
			return undefined;
		}
		const selected = await this.quickInputService.pick(definition.actions.map(action => ({
			label: action.name, detail: action.description, action,
		})), { title: localize('canvas.chooseAction', "Run Canvas Action") });
		if (!selected) {
			return undefined;
		}
		const input = await this.readInput(selected.action.inputSchema);
		const result = await this.canvasService.invokeAction(target, { instanceId, actionName: selected.action.name, input });
		this.notificationService.info(localize('canvas.actionResult', "Canvas action completed: {0}", JSON.stringify(result)));
		return result;
	}

	private async readInput(schema: AgentHostCanvasJson | undefined): Promise<AgentHostCanvasJson | undefined> {
		if (schema === undefined) {
			return undefined;
		}
		const value = await this.quickInputService.input({
			title: localize('canvas.inputTitle', "Canvas JSON Input"),
			prompt: localize('canvas.inputSchema', "Enter JSON input matching this schema: {0}", JSON.stringify(schema)),
			value: isRecord(schema) && schema.default !== undefined ? JSON.stringify(schema.default) : '{}',
			validateInput: async value => {
				try {
					const parsed: unknown = JSON.parse(value);
					return isAgentHostCanvasJson(parsed) ? undefined : localize('canvas.invalidJsonValue', "Enter a JSON value.");
				} catch {
					return localize('canvas.invalidJson', "Enter valid JSON, for example an object with quoted property names.");
				}
			},
		});
		if (value === undefined) {
			throw new CancellationError();
		}
		const parsed: unknown = JSON.parse(value);
		if (!isAgentHostCanvasJson(parsed)) {
			throw new Error(localize('canvas.invalidJsonValue', "Enter a JSON value."));
		}
		return parsed;
	}
}
