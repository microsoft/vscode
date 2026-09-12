/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, isObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import type { IChat } from '../../../services/sessions/common/session.js';
import { CANVAS_INPUT_MAX_LENGTH, CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, SessionCanvasUri, type CanvasEntry, type CanvasTypeDeclaration, type ISessionCanvasReference } from '../../../services/sessions/common/sessionCanvases.js';
import { ISessionCanvasService, SessionCanvasInput, type ISessionCanvasTarget } from '../common/sessionCanvas.js';

export const SessionCanvasCommands = {
	manage: 'workbench.action.sessions.canvas.manage',
	reload: 'workbench.action.sessions.canvas.reloadView',
	close: 'workbench.action.sessions.canvas.close',
	restart: 'workbench.action.sessions.canvas.restartProvider',
	accessibleView: 'workbench.action.sessions.canvas.accessibleView',
} as const;

type CanvasPick = IQuickPickItem & (
	| { readonly kind: 'type'; readonly declaration: CanvasTypeDeclaration }
	| { readonly kind: 'instance'; readonly canvas: CanvasEntry }
	| { readonly kind: 'initialize' }
	| { readonly kind: 'refresh' }
);

function entryDescription(canvas: CanvasEntry): string {
	if (canvas.trust.status === CanvasTrustStatus.Pending) {
		return localize('canvas.needsApproval', "Approval Required");
	}
	if (canvas.trust.status === CanvasTrustStatus.Blocked) {
		return localize('canvas.trustBlocked', "Blocked");
	}
	switch (canvas.availability) {
		case CanvasAvailabilityStatus.Ready: return localize('canvas.statusReady', "Ready");
		case CanvasAvailabilityStatus.Empty: return localize('canvas.statusEmpty', "Waiting for Content");
		case CanvasAvailabilityStatus.Loading: return localize('canvas.statusLoading', "Loading");
		case CanvasAvailabilityStatus.Failed: return localize('canvas.statusFailed', "Failed");
		case CanvasAvailabilityStatus.Unsupported: return localize('canvas.statusUnsupported', "Unsupported");
		case CanvasAvailabilityStatus.NotLoaded: return localize('canvas.statusNotLoaded', "Provider Not Loaded");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSessionCanvasReference(value: unknown): value is ISessionCanvasReference {
	return isRecord(value) && typeof value.providerId === 'string'
		&& URI.isUri(value.session) && URI.isUri(value.chat) && URI.isUri(value.canvas);
}

/** Invalid explicit owners must not fall through to editor-command active-editor defaults. */
export function canvasReferenceFromContext(value: unknown): ISessionCanvasReference | undefined {
	const invalidReference = localize('canvas.invalidReference', "Provide a valid logical canvas reference for this command.");
	if (value instanceof SessionCanvasInput) {
		return value.reference;
	}
	if (URI.isUri(value)) {
		const reference = SessionCanvasUri.parse(value);
		if (!reference) {
			throw new Error(invalidReference);
		}
		return reference;
	}
	if (!isRecord(value) || !['providerId', 'session', 'chat', 'canvas'].some(key => hasKey(value, { [key]: true }))) {
		return undefined;
	}
	if (!isSessionCanvasReference(value)) {
		throw new Error(invalidReference);
	}
	try {
		SessionCanvasUri.create(value);
	} catch {
		throw new Error(invalidReference);
	}
	return value;
}

export class SessionCanvasActions {
	constructor(
		@ISessionCanvasService private readonly canvasService: ISessionCanvasService,
		@ISessionContext private readonly sessionContext: ISessionContext,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDialogService private readonly dialogService: IDialogService,
		@IProgressService private readonly progressService: IProgressService,
	) { }

	resolveTarget(context?: unknown): ISessionCanvasTarget {
		let session: URI | undefined;
		let chat: URI | undefined;
		if (context === undefined || context === null) {
			const represented = this.sessionContext.session.get();
			session = represented?.resource;
			chat = represented?.activeChat.get().resource;
		} else if (isRecord(context) && URI.isUri(context.resource) && isObservable<IChat>(context.activeChat)) {
			session = context.resource;
			chat = context.activeChat.get().resource;
		} else if (isRecord(context) && typeof context.sessionResource === 'string' && typeof context.chatResource === 'string') {
			session = URI.parse(context.sessionResource, true);
			chat = URI.parse(context.chatResource, true);
		}
		const target = session && chat ? this.canvasService.getTarget(session, chat) : undefined;
		if (!target) {
			throw new Error(localize('canvas.selectOwner', "Select a supported local conversation with the canvas preview enabled."));
		}
		return target;
	}

	async manage(context?: unknown): Promise<void> {
		const target = this.resolveTarget(context);
		while (true) {
			const selection = await this.pick(target);
			if (selection?.kind === 'initialize') {
				const completed = await this.initializeProviders(target);
				const represented = this.sessionContext.session.get();
				if (!completed || !represented || !isEqual(represented.resource, target.session.resource)
					|| !isEqual(represented.activeChat.get().resource, target.chat.resource)) {
					return;
				}
			} else {
				if (selection?.kind === 'instance') {
					await this.canvasService.reveal(target, selection.canvas);
				} else if (selection?.kind === 'type') {
					await this.openType(target, selection.declaration);
				}
				return;
			}
		}
	}

	private async pick(target: ISessionCanvasTarget): Promise<CanvasPick | undefined> {
		const store = new DisposableStore();
		const picker = store.add(this.quickInputService.createQuickPick<CanvasPick>({ useSeparators: true }));
		picker.title = localize('canvas.picker', "Canvases — {0}", target.chat.title.get());
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;
		let selection: CanvasPick | undefined;
		store.add(autorun(reader => {
			const catalog = target.canvases.catalog.read(reader);
			const entries = target.canvases.entries.read(reader);
			const error = target.canvases.error.read(reader);
			const available = this.canvasService.enabled.read(reader) && target.canvases.availability.read(reader) === 'available';
			const supportsInitialization = target.canvases.supportsInitialization.read(reader);
			const initializing = target.canvases.initializing.read(reader);
			picker.busy = target.canvases.loading.read(reader) || initializing;
			picker.placeholder = !available
				? localize('canvas.pickerUnavailable', "The canvas runtime is unavailable. No provider is started by browsing.")
				: initializing ? localize('canvas.pickerInitializing', "Canvas providers are being initialized for this conversation. Extension approval may be required.")
					: error ? localize('canvas.pickerFailed', "The catalog could not be read. Refresh to retry this read only.")
						: !catalog.length && !entries.length && !picker.busy
							? supportsInitialization
								? localize('canvas.pickerInitialize', "No live canvas types are registered. Initialize providers to discover them; extension approval may be required.")
								: localize('canvas.pickerEmpty', "No live canvas types are registered for this chat. Refresh only reads existing providers.")
							: localize('canvas.pickerHint', "Show an existing canvas or open a live type. Closing a tab only hides its view.");
			const items: QuickPickInput<CanvasPick>[] = [];
			if (available) {
				if (entries.length) {
					items.push({ type: 'separator', label: localize('canvas.instances', "Canvases in this chat") });
					items.push(...entries.map((canvas): CanvasPick => ({
						kind: 'instance', canvas, id: canvas.resource, label: canvas.title,
						description: entryDescription(canvas),
					})));
				}
				if (catalog.length) {
					items.push({ type: 'separator', label: localize('canvas.liveTypes', "Live canvas types") });
					items.push(...catalog.map((declaration): CanvasPick => ({
						kind: 'type', declaration, label: declaration.title, detail: declaration.description,
						description: declaration.source.kind === CanvasSourceKind.Extension ? declaration.source.extensionId : declaration.source.packageName,
					})));
				}
				if (!catalog.length && supportsInitialization && !initializing) {
					items.push({
						kind: 'initialize', label: localize('canvas.initializeProviders', "Initialize Canvas Providers"),
						description: localize('canvas.initializeEffect', "May start extensions and request approval"),
					});
				}
				items.push({ kind: 'refresh', label: localize('canvas.refreshCatalog', "Refresh Live Catalog"), description: localize('canvas.refreshPure', "Does not start or restart providers") });
			}
			picker.items = items;
		}));
		try {
			const selected = new Promise<CanvasPick | undefined>(resolve => {
				store.add(picker.onDidAccept(() => {
					const item = picker.selectedItems[0];
					if (item?.kind === 'refresh') {
						void target.canvases.refresh().catch(() => { /* The picker reads the collection's error state. */ });
					} else {
						resolve(item);
					}
				}));
				store.add(picker.onDidHide(() => resolve(undefined)));
			});
			picker.show();
			void target.canvases.refresh().catch(() => { /* The picker reads the collection's error state. */ });
			selection = await selected;
		} finally {
			picker.hide();
			store.dispose();
		}
		return selection;
	}

	private async initializeProviders(target: ISessionCanvasTarget): Promise<boolean> {
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource());
		try {
			await this.progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('canvas.initializingProviders', "Initializing Canvas Providers — {0}", target.chat.title.get()),
				cancellable: true,
				delay: 500,
			}, () => target.canvases.initialize(cancellation.token), () => cancellation.cancel());
			return true;
		} catch (error) {
			if (isCancellationError(error)) {
				return false;
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	private async openType(target: ISessionCanvasTarget, declaration: CanvasTypeDeclaration): Promise<void> {
		const schema = declaration.openInputSchema ? JSON.stringify(declaration.openInputSchema) : declaration.openInputSchemaRef;
		const value = await this.quickInputService.input({
			title: localize('canvas.openInputTitle', "Open {0}", declaration.title),
			prompt: schema
				? localize('canvas.openInputSchema', "JSON input, validated by the provider. Declared schema: {0}", schema)
				: localize('canvas.openInput', "Enter JSON input, or leave empty for no input."),
			value: declaration.openInputSchema ? '{}' : '',
			validateInput: async value => {
				if (value.length > CANVAS_INPUT_MAX_LENGTH) {
					return localize('canvas.inputTooLarge', "Canvas input exceeds the protocol size limit.");
				}
				try {
					if (value.trim()) {
						JSON.parse(value);
					}
					return undefined;
				} catch {
					return localize('canvas.inputInvalid', "Enter valid JSON.");
				}
			},
		});
		if (value === undefined) {
			return;
		}
		const input: unknown = value.trim() ? JSON.parse(value) : undefined;
		await this.canvasService.open(target, {
			source: declaration.source, canvasType: declaration.canvasType, instanceId: generateUuid(),
			title: declaration.title, icon: declaration.icon, input,
		});
	}

	async restart(reference: ISessionCanvasReference): Promise<void> {
		const target = this.canvasService.getTarget(reference.session, reference.chat);
		const entry = target?.canvases.entries.get().find(entry => entry.resource === reference.canvas.toString());
		if (!target || target.session.providerId !== reference.providerId || !entry) {
			throw new Error(localize('canvas.restartMissing', "The canvas is no longer available in its owning chat."));
		}
		const confirmation = await this.dialogService.confirm({
			type: 'warning',
			message: localize('canvas.restartConfirm', "Restart the provider for {0}?", entry.title),
			detail: localize('canvas.restartImpact', "This can replace every live canvas sharing this provider in the conversation \"{0}\". Process and page state may be lost; provider-owned files are retained. No actions are replayed. If recovery also requires replacing the owned runtime, a separate approval explains its impact on other resident chats.", target.chat.title.get()),
			primaryButton: localize('canvas.restartButton', "Restart Provider"),
		});
		if (confirmation.confirmed) {
			await target.canvases.restart(entry);
		}
	}
}
