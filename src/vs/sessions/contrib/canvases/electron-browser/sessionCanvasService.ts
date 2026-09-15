/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Sequencer } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IReference } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue, type IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IBrowserViewWorkbenchService } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionCanvasesEnabledSettingId, SessionCanvasUri, type CanvasEntry, type ISessionCanvasReference, type SessionCanvasOpenOptions } from '../../../services/sessions/common/sessionCanvases.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionCanvasService, SessionCanvasInput, type ISessionCanvasTarget } from '../common/sessionCanvas.js';
import { SessionCanvasPresentation } from '../common/sessionCanvasPresentation.js';

export class SessionCanvasService extends Disposable implements ISessionCanvasService {
	declare readonly _serviceBrand: undefined;
	readonly enabled;
	private readonly inputs = this._register(new DisposableMap<string, SessionCanvasInput>());
	private readonly inputLifetimes = this._register(new DisposableMap<string, DisposableStore>());
	private readonly presentations = this._register(new DisposableMap<string, SessionCanvasPresentation>());
	private readonly closing = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly nativeCreations = new Map<string, { sequencer: Sequencer; pending: number }>();

	constructor(
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IBrowserViewWorkbenchService private readonly browserService: IBrowserViewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.enabled = observableFromEvent(this, Event.any(entitlementService.onDidChangeSentiment, configurationService.onDidChangeConfiguration),
			() => !entitlementService.sentiment.hidden && configurationService.getValue<boolean>(SessionCanvasesEnabledSettingId) === true);
		let previousTarget: string | undefined;
		let previousEntries = new Set<string>();
		let initialized = false;
		this._register(autorun(reader => {
			if (!this.enabled.read(reader)) {
				this.presentations.clearAndDisposeAll();
				this.inputs.clearAndDisposeAll();
				previousTarget = undefined;
				return;
			}
			const session = sessionsService.activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			const supported = session?.capabilities.read(reader).supportsCanvases;
			const target = session && chat && supported ? this.getTarget(session.resource, chat.resource, reader) : undefined;
			const key = target ? `${target.session.sessionId}/${target.chat.resource.toString()}` : undefined;
			const entries = target?.canvases.entries.read(reader) ?? [];
			const nextInitialized = target?.canvases.initialized.read(reader) ?? false;
			const generation = target?.canvases.generation.read(reader);
			const targetKey = key === undefined ? undefined : `${key}/${generation}`;
			if (targetKey === previousTarget && initialized && nextInitialized && target) {
				for (const entry of entries) {
					if (!previousEntries.has(entry.resource)) {
						void this.reveal(target, entry, true).catch(() => this.logService.warn('Canvas presentation could not be revealed.'));
					}
				}
			}
			previousTarget = targetKey;
			previousEntries = new Set(entries.map(entry => entry.resource));
			initialized = nextInitialized;
			if (target) {
				for (const entry of entries) {
					this.inputs.get(SessionCanvasUri.create(this.reference(target, entry)).toString())?.setTitle(entry.title);
				}
			}
		}));
	}

	getTarget(sessionResource: URI, chatResource: URI, reader?: IReader): ISessionCanvasTarget | undefined {
		const session = this.managementService.getSession(sessionResource, { includeDrafts: true });
		const chat = session?.chats.read(reader).find(chat => isEqual(chat.resource, chatResource));
		if (!this.enabled.read(reader) || !session || !chat || session.isArchived.read(reader)) {
			return undefined;
		}
		const canvases = this.managementService.getSessionCanvases(sessionResource, chatResource);
		return canvases ? { session, chat, canvases } : undefined;
	}

	isVisibleOwner(reference: ISessionCanvasReference, reader?: IReader): boolean {
		const session = this.sessionsService.activeSession.read(reader);
		return this.enabled.read(reader) && !!session && session.providerId === reference.providerId
			&& session.capabilities.read(reader).supportsCanvases === true
			&& !session.isArchived.read(reader) && isEqual(session.resource, reference.session)
			&& session.chats.read(reader).some(chat => isEqual(chat.resource, reference.chat))
			&& isEqual(session.activeChat.read(reader).resource, reference.chat);
	}

	isClosing(reference: ISessionCanvasReference, reader?: IReader): boolean {
		return this.closing.read(reader).has(SessionCanvasUri.create(reference).toString());
	}

	getInput(resource: URI): SessionCanvasInput {
		const key = resource.toString();
		let input = this.inputs.get(key);
		if (!input || input.isDisposed()) {
			input = new SessionCanvasInput(resource);
			this.inputs.set(key, input);
			const lifetime = new DisposableStore();
			this.inputLifetimes.set(key, lifetime);
			lifetime.add(Event.once(input.onWillDispose)(() => {
				this.presentations.deleteAndDispose(key);
				this.inputs.deleteAndLeak(key);
				this.inputLifetimes.deleteAndDispose(key);
			}));
		}
		const { reference } = input;
		const target = this.getTarget(reference.session, reference.chat);
		if (target?.session.providerId === reference.providerId) {
			const entry = target.canvases.entries.get().find(entry => entry.resource === reference.canvas.toString());
			if (entry) {
				input.setTitle(entry.title);
			}
		}
		return input;
	}

	acquirePresentation(input: SessionCanvasInput, windowId: number): IReference<SessionCanvasPresentation> | undefined {
		const { reference } = input;
		if (input.isDisposed() || windowId !== mainWindow.vscodeWindowId || !this.isVisibleOwner(reference) || this.isClosing(reference)) {
			return undefined;
		}
		const target = this.getTarget(reference.session, reference.chat);
		if (!target || target.session.providerId !== reference.providerId) {
			return undefined;
		}
		const key = input.resource.toString();
		if (this.presentations.has(key)) {
			return undefined;
		}
		let released = false;
		const presentation = new SessionCanvasPresentation(target.canvases, reference.canvas.toString(), async url => {
			let creations = this.nativeCreations.get(key);
			if (!creations) {
				creations = { sequencer: new Sequencer(), pending: 0 };
				this.nativeCreations.set(key, creations);
			}
			creations.pending++;
			try {
				return await creations.sequencer.queue(() => {
					if (released || input.isDisposed() || this._store.isDisposed) {
						throw new Error('Canvas presentation was detached.');
					}
					return this.browserService.getOrCreateExternalBrowserView(generateUuid(), input.resource, url);
				});
			} finally {
				if (--creations.pending === 0) {
					this.nativeCreations.delete(key);
				}
			}
		});
		this.presentations.set(key, presentation);
		return {
			object: presentation,
			dispose: () => {
				released = true;
				if (this.presentations.get(key) === presentation) {
					this.presentations.deleteAndDispose(key);
				}
			},
		};
	}

	private reference(target: ISessionCanvasTarget, canvas: CanvasEntry): ISessionCanvasReference {
		return { providerId: target.session.providerId, session: target.session.resource, chat: target.chat.resource, canvas: URI.parse(canvas.resource) };
	}

	async open(target: ISessionCanvasTarget, options: SessionCanvasOpenOptions): Promise<URI> {
		this.assertTarget(target);
		const canvas = await target.canvases.open(options);
		if (!this.isVisibleOwner(this.reference(target, canvas))) {
			this.notificationService.info(localize('canvas.openedElsewhere', "The canvas belongs to its original conversation. Select that conversation and use Canvases to show it."));
			return SessionCanvasUri.create(this.reference(target, canvas));
		}
		return this.reveal(target, canvas);
	}

	async reveal(target: ISessionCanvasTarget, canvas: CanvasEntry, preserveFocus = false): Promise<URI> {
		this.assertTarget(target);
		const reference = this.reference(target, canvas);
		const resource = SessionCanvasUri.create(reference);
		if (!this.isVisibleOwner(reference)) {
			return resource;
		}
		const input = this.getInput(resource);
		input.setTitle(canvas.title);
		const pane = await this.editorService.openEditor(input, { pinned: true, revealIfOpened: true, preserveFocus }, this.editorGroupsService.mainPart.activeGroup);
		if (pane?.input === input && !this.isVisibleOwner(reference)) {
			await this.editorService.closeEditor({ editor: input, groupId: pane.group.id }, { preserveFocus: true });
		}
		return resource;
	}

	private assertTarget(target: ISessionCanvasTarget): void {
		const current = this.getTarget(target.session.resource, target.chat.resource);
		if (!current || current.session.providerId !== target.session.providerId || current.canvases !== target.canvases) {
			throw new Error(localize('canvas.targetUnavailable', "The owning chat is no longer available for canvas operations."));
		}
	}

	private currentEntry(reference: ISessionCanvasReference): { target: ISessionCanvasTarget; canvas: CanvasEntry } {
		const target = this.getTarget(reference.session, reference.chat);
		const canvas = target?.canvases.entries.get().find(entry => entry.resource === reference.canvas.toString());
		if (!target || target.session.providerId !== reference.providerId || !canvas) {
			throw new Error(localize('canvas.noLongerAvailable', "The canvas is no longer available in its owning chat."));
		}
		return { target, canvas };
	}

	async close(reference: ISessionCanvasReference): Promise<void> {
		const { target, canvas } = this.currentEntry(reference);
		const resource = SessionCanvasUri.create(reference);
		const key = resource.toString();
		if (this.closing.get().has(key)) {
			return;
		}
		this.closing.set(new Set([...this.closing.get(), key]), undefined);
		this.presentations.deleteAndDispose(key);
		try {
			await target.canvases.close(canvas);
			this.inputs.deleteAndDispose(key);
		} finally {
			const closing = new Set(this.closing.get());
			closing.delete(key);
			this.closing.set(closing, undefined);
		}
	}

	async restart(reference: ISessionCanvasReference): Promise<void> {
		const { target, canvas } = this.currentEntry(reference);
		await target.canvases.restart(canvas);
	}

	reload(reference: ISessionCanvasReference): void {
		this.currentEntry(reference);
		this.presentations.get(SessionCanvasUri.create(reference).toString())?.reload();
	}
}
