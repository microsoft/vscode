/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getCanvasDefinitionInstanceId, getCanvasDefinitionLabels, getCanvasInstanceLabels, ICanvasDefinition } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../../workbench/contrib/canvases/common/canvasDefinitionStore.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IInboxCanvasHost, IInboxCanvasHostService } from './inboxCanvasHost.js';

export class InboxCanvases extends Disposable {
	readonly element = $('.inbox-evidence-canvases');
	private readonly selected = observableValue<URI | undefined>(this, undefined);
	private readonly pendingInstance = observableValue<string | undefined>(this, undefined);
	private readonly host = this._register(new MutableDisposable<IInboxCanvasHost>());
	private visible = true;

	constructor(
		session: ISession,
		chat: IChat,
		viewport: HTMLElement,
		onLayout: () => void,
		@IInboxCanvasHostService hostService: IInboxCanvasHostService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IAccessibleViewService accessibleViewService: IAccessibleViewService,
		@ILogService logService: ILogService,
		@INotificationService notificationService: INotificationService,
	) {
		super();
		if (!hostService.supported) {
			this.element.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.canvas.desktop', "Interactive extension canvases are available in the desktop application.")));
			this._register(autorun(reader => {
				this.element.hidden = !chat.canvases?.read(reader)?.length;
				onLayout();
			}));
			return;
		}
		const definitions = this._register(new CanvasDefinitionStore(reader => {
			chat.canvases?.read(reader);
			if (!hostService.enabled.read(reader) || session.capabilities.read(reader).supportsCanvases !== true) {
				return undefined;
			}
			return {
				owner: { providerId: session.providerId, session: session.resource, chat: chat.resource },
				includeDefinition: () => true,
				listCanvases: () => sessionsManagementService.listCanvases(session, chat),
			};
		}, '[InboxCanvases]', logService));
		const controls = this.element.appendChild($('.inbox-evidence-canvas-controls'));
		const presentation = this.element.appendChild($('.inbox-evidence-canvas-presentation'));
		const controlsStore = this._register(new DisposableStore());
		const action = (container: HTMLElement, label: string, run: () => void | Promise<void>, enabled = true) => {
			const button = controlsStore.add(new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
			button.label = label;
			button.enabled = enabled;
			controlsStore.add(button.onDidClick(async () => {
				try {
					await run();
				} catch (error) {
					logService.error('[InboxCanvases] Canvas action failed', error);
					notificationService.error(localize('inbox.canvas.openFailed', "Could not open this extension canvas. Check that its extension and session are available."));
				}
			}));
		};
		const openDefinition = async (definition: ICanvasDefinition) => {
			if (!hostService.enabled.get() || definition.requiresInput || session.capabilities.get().supportsCanvases !== true || sessionsManagementService.getSession(session.resource) !== session) {
				throw new Error('Canvas owner or capability is no longer available');
			}
			const instanceId = getCanvasDefinitionInstanceId(definition);
			await sessionsManagementService.openCanvas(session, chat, definition, instanceId);
			if (this._store.isDisposed) {
				return;
			}
			this.pendingInstance.set(instanceId, undefined);
		};
		this._register(autorun(reader => {
			const enabled = hostService.enabled.read(reader) && session.capabilities.read(reader).supportsCanvases === true;
			const canvases = enabled ? chat.canvases?.read(reader) ?? [] : [];
			const available = enabled ? definitions.definitions.read(reader) : [];
			const selected = this.selected.read(reader);
			controlsStore.clear();
			clearNode(controls);
			this.element.hidden = !canvases.length && !available.length;
			if (!this.element.hidden) {
				controls.appendChild($('h3', undefined, localize('inbox.canvas.heading', "Extension canvases")));
				controls.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.canvas.description', "Choose a canvas supplied by this conversation's extensions. Its content is extension-provided, not independent verification.")));
			}
			const labels = getCanvasInstanceLabels(canvases);
			canvases.forEach((canvas, index) => {
				action(controls, labels[index], () => {
					this.pendingInstance.set(undefined, undefined);
					this.selected.set(canvas.resource, undefined);
				}, hostService.supported && !!canvas.source);
				if (!canvas.source) {
					controls.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.canvas.disconnected', "{0}: provider unavailable.", labels[index])));
				}
			});
			const definitionLabels = getCanvasDefinitionLabels(available);
			available.forEach((definition, index) => {
				if (canvases.some(canvas => canvas.instanceId === getCanvasDefinitionInstanceId(definition))) {
					return;
				}
				action(controls, definitionLabels[index], () => openDefinition(definition), hostService.supported && !definition.requiresInput);
				if (definition.requiresInput) {
					controls.appendChild($('p.inbox-evidence-note', undefined, localize('inbox.canvas.requiresInput', "{0} requires input. Ask the agent to open it using the reply below.", definitionLabels[index])));
				}
			});
			if (canvases.some(canvas => isEqual(canvas.resource, selected) || canvas.instanceId !== undefined && canvas.instanceId === this.pendingInstance.read(reader))) {
				action(controls, localize('inbox.canvas.hide', "Hide canvas"), () => {
					this.pendingInstance.set(undefined, undefined);
					this.selected.set(undefined, undefined);
				});
				action(controls, localize('inbox.canvas.read', "Read canvas"), () => {
					const provider = this.host.value?.createAccessibleProvider();
					if (provider) {
						accessibleViewService.show(provider);
					}
				});
			}
			onLayout();
		}));
		let attachedResource: URI | undefined;
		let attachedSource: URI | undefined;
		this._register(autorun(reader => {
			const selected = this.selected.read(reader);
			const pendingInstance = this.pendingInstance.read(reader);
			const enabled = hostService.enabled.read(reader) && session.capabilities.read(reader).supportsCanvases === true;
			const canvas = enabled ? chat.canvases?.read(reader)?.find(canvas => pendingInstance !== undefined ? canvas.instanceId === pendingInstance : isEqual(canvas.resource, selected)) : undefined;
			if (isEqual(attachedResource, canvas?.resource) && isEqual(attachedSource, canvas?.source)) {
				return;
			}
			attachedResource = canvas?.resource;
			attachedSource = canvas?.source;
			this.host.clear();
			clearNode(presentation);
			if (canvas?.source && hostService.supported) {
				this.host.value = hostService.create(presentation, viewport, session, chat, canvas);
				this.host.value.setVisible(this.visible);
			}
			onLayout();
		}));
	}

	layout(): void {
		this.host.value?.layout();
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.host.value?.setVisible(visible);
	}

	createAccessibleProvider() {
		const focused = getActiveElement();
		return isHTMLElement(focused) && focused.classList.contains('inbox-evidence-native-canvas') && this.element.contains(focused)
			? this.host.value?.createAccessibleProvider() : undefined;
	}
}
