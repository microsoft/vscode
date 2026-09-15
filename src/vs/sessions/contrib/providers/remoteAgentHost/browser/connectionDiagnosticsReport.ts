/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/connectionDiagnostics.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IMobileContentSheetApi, showMobileContentSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { ConnectionHostManagementAction, IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, IConnectionHostManagementEntry } from './connectionDiagnostics.js';

export class ConnectionDiagnosticsReport extends Disposable {
	private readonly _onDidChangeFocusTargets = this._register(new Emitter<void>());
	readonly onDidChangeFocusTargets = this._onDidChangeFocusTargets.event;

	private readonly managementStore = this._register(new DisposableStore());
	private readonly content: HTMLElement;
	private readonly message: HTMLElement;
	private readonly sectionFocusTargets: HTMLElement[] = [];
	private readonly actionFocusTargets: HTMLElement[] = [];
	private snapshot: IConnectionDiagnosticsSnapshot;
	private pendingHostId: string | undefined;
	private actionError: { readonly hostId: string; readonly message: string } | undefined;

	constructor(
		container: HTMLElement,
		snapshot: IConnectionDiagnosticsSnapshot,
		private readonly triggerDownload: typeof dom.triggerDownload = dom.triggerDownload,
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
		this.snapshot = snapshot;
		container.classList.add('connection-diagnostics');
		this.message = dom.append(container, dom.$('div.connection-diagnostics-message', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
		this.message.hidden = true;
		this.content = dom.append(container, dom.$('div.connection-diagnostics-content'));
		this.content.tabIndex = 0;
		this.content.setAttribute('role', 'region');
		this.content.setAttribute('aria-label', localize('connectionDiagnostics.report', "Connection diagnostics report"));
		this.render();
		this._register(this.diagnosticsService.onDidChangeHostManagement(() => this.render()));
	}

	getSnapshot(): IConnectionDiagnosticsSnapshot {
		return this.snapshot;
	}

	focus(): void {
		this.content.focus();
	}

	getFocusTargets(): readonly HTMLElement[] {
		return [this.content, ...this.sectionFocusTargets, ...this.actionFocusTargets];
	}

	async refresh(): Promise<void> {
		try {
			await this.diagnosticsService.rediscover();
			this.snapshot = this.diagnosticsService.getSnapshot();
			this.render();
			this.announce(localize('connectionDiagnostics.refreshed', "Hosts rediscovered and snapshot refreshed."));
		} catch (error) {
			this.announce(localize('connectionDiagnostics.refreshFailed', "Could not refresh connection information. {0}", toErrorMessage(error)));
		}
	}

	async copy(): Promise<void> {
		try {
			// Start the clipboard write before yielding to preserve browser user activation.
			await this.clipboardService.writeText(this.snapshot.text);
			this.announce(localize('connectionDiagnostics.copied', "Diagnostics copied."));
		} catch {
			this.announce(localize('connectionDiagnostics.copyFailed', "Could not copy. Try downloading diagnostics."));
		}
	}

	download(): void {
		try {
			const timestamp = new Date(this.snapshot.capturedAt).toISOString().replace(/[:.]/g, '-');
			this.triggerDownload(VSBuffer.fromString(this.snapshot.text).buffer, `connection-diagnostics-${timestamp}.txt`);
			this.announce(localize('connectionDiagnostics.downloadStarted', "Download requested."));
		} catch {
			this.announce(localize('connectionDiagnostics.downloadFailed', "Could not download. Try copying diagnostics."));
		}
	}

	announce(message: string): void {
		if (!this._store.isDisposed) {
			this.message.hidden = false;
			this.message.textContent = message;
		}
	}

	private render(): void {
		const openSections = new Set(Array.from(this.content.children).flatMap(element => {
			if (element.tagName !== 'DETAILS' || !(element as HTMLDetailsElement).open) {
				return [];
			}
			return [(element as HTMLDetailsElement).dataset.hostAddress ?? element.firstElementChild?.textContent ?? ''];
		}));
		const activeElement = dom.getActiveElement();
		const focusedHostId = dom.isHTMLElement(activeElement) ? activeElement.dataset.hostId : undefined;
		const focusedAction = dom.isHTMLElement(activeElement) ? activeElement.dataset.hostAction : undefined;
		this.managementStore.clear();
		dom.clearNode(this.content);
		this.sectionFocusTargets.length = 0;
		this.actionFocusTargets.length = 0;
		const managementByAddress = new Map(this.diagnosticsService.getHostManagementState().hosts.flatMap(host => host.address ? [[host.address, host] as const] : []));
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.sharing', "Local snapshot. Review host names and addresses before sharing.");
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.captured', "Captured: {0}", this.snapshot.capturedAt);
		for (const section of [...this.snapshot.sections.filter(section => !section.collapsed), ...this.snapshot.sections.filter(section => section.collapsed)]) {
			const element = dom.append(this.content, dom.$(section.collapsed ? 'details.connection-diagnostics-section' : 'section.connection-diagnostics-section'));
			if (section.hostAddress) {
				element.classList.add('connection-diagnostics-host-section');
				element.dataset.hostAddress = section.hostAddress;
			}
			const heading = dom.append(element, dom.$(section.collapsed ? 'summary' : 'h2'));
			heading.textContent = section.title;
			if (section.collapsed) {
				this.sectionFocusTargets.push(heading);
				(element as HTMLDetailsElement).open = openSections.has(section.hostAddress ?? section.title);
			}
			const host = section.hostAddress ? managementByAddress.get(section.hostAddress) : undefined;
			if (host) {
				const actions = dom.append(element, dom.$('div.connection-diagnostics-host-actions'));
				this.renderHostManagementAction(actions, host);
				this.managementStore.add(dom.addDisposableListener(actions, dom.EventType.CLICK, event => event.stopPropagation()));
			}
			if (section.description) {
				dom.append(element, dom.$('p')).textContent = section.description;
			}
			const entries = dom.append(element, dom.$('dl'));
			for (const entry of section.entries) {
				dom.append(entries, dom.$('dt')).textContent = entry.label;
				dom.append(entries, dom.$('dd')).textContent = entry.value;
			}
		}
		this._onDidChangeFocusTargets.fire();
		this.restoreManagementFocus(focusedHostId, focusedAction);
	}

	private renderHostManagementAction(container: HTMLElement, host: IConnectionHostManagementEntry): void {
		const pending = this.pendingHostId === host.id;
		let action: ConnectionHostManagementAction | undefined;
		let label: string | undefined;
		let icon: ThemeIcon | undefined;
		if (host.hidden) {
			action = 'restore';
			label = localize('connectionDiagnostics.restoreHost', "Restore {0}", host.label);
			icon = Codicon.add;
		} else if (host.connectable && (host.status === 'connected' || host.status === 'connecting' || host.status === 'reconnecting')) {
			action = 'disconnect';
			label = localize('connectionDiagnostics.disconnectHost', "Disconnect {0}", host.label);
			icon = Codicon.debugDisconnect;
		} else if (host.connectable && host.status === 'disconnected') {
			action = 'reconnect';
			label = localize('connectionDiagnostics.reconnectHost', "Reconnect {0}", host.label);
			icon = Codicon.debugStart;
		}
		if (!action || !label || !icon) {
			return;
		}
		const button = this.managementStore.add(new Button(container, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: true }));
		button.label = `$(${icon.id})`;
		button.element.setAttribute('aria-label', label);
		button.element.dataset.hostId = host.id;
		button.element.dataset.hostAction = action;
		button.enabled = !pending;
		this.actionFocusTargets.push(button.element);
		this.managementStore.add(button.onDidClick(() => void this.runHostAction(host.id, action)));
		if (this.actionError?.hostId === host.id) {
			const error = dom.append(container, dom.$('span.connection-diagnostics-host-error', { role: 'alert' }));
			error.textContent = this.actionError.message;
		}
	}

	private restoreManagementFocus(hostId: string | undefined, action: string | undefined): void {
		if (action) {
			this.actionFocusTargets.find(target => target.dataset.hostId === hostId && target.dataset.hostAction === action)?.focus();
		}
	}

	private async runHostAction(hostId: string, action: ConnectionHostManagementAction): Promise<void> {
		if (this.pendingHostId) {
			return;
		}
		this.pendingHostId = hostId;
		this.actionError = undefined;
		this.render();
		try {
			await this.diagnosticsService.runHostAction(hostId, action);
		} catch (error) {
			this.actionError = { hostId, message: toErrorMessage(error) };
		} finally {
			this.pendingHostId = undefined;
			this.render();
		}
	}
}

export function showConnectionDiagnosticsSheet(
	container: HTMLElement,
	snapshot: IConnectionDiagnosticsSnapshot,
	instantiationService: IInstantiationService,
	options: {
		readonly onDidCreate?: (report: ConnectionDiagnosticsReport, api: IMobileContentSheetApi) => IDisposable;
		readonly triggerDownload?: typeof dom.triggerDownload;
		readonly autoFocus?: boolean;
	} = {},
): Promise<void> {
	let report: ConnectionDiagnosticsReport;
	let api: IMobileContentSheetApi;
	return showMobileContentSheet(container, localize('connectionDiagnostics.title', "Connection information"), (body, sheetApi) => {
		const store = new DisposableStore();
		api = sheetApi;
		api.overlay.classList.add('connection-diagnostics-overlay');
		report = store.add(instantiationService.createInstance(ConnectionDiagnosticsReport, body, snapshot, options.triggerDownload));
		api.setBodyFocusTargets(report.getFocusTargets());
		store.add(report.onDidChangeFocusTargets(() => api.setBodyFocusTargets(report.getFocusTargets())));
		if (options.onDidCreate) {
			store.add(options.onDidCreate(report, api));
		}
		if (options.autoFocus !== false) {
			report.focus();
		}
		return store;
	}, {
		iconClose: true,
		trapFocus: true,
		headerActions: [
			{ id: 'copy', label: localize('connectionDiagnostics.copy', "Copy Diagnostics"), icon: Codicon.copy },
			{ id: 'download', label: localize('connectionDiagnostics.download', "Download Diagnostics"), icon: Codicon.cloudDownload },
			{ id: 'refresh', label: localize('connectionDiagnostics.refresh', "Refresh"), icon: Codicon.refresh },
		],
		onHeaderAction: id => {
			switch (id) {
				case 'copy': return report.copy();
				case 'download': return report.download();
				case 'refresh': return report.refresh().then(() => {
					api.setBodyFocusTargets(report.getFocusTargets());
				});
			}
		},
	});
}
