/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/connectionDiagnostics.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
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
	private readonly renderScheduler = this._register(new MutableDisposable<IDisposable>());
	private readonly content: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly message: HTMLElement;
	private readonly bodyFocusTargets: HTMLElement[] = [];
	private readonly hostFocusTargets = new Map<string, HTMLElement>();
	private snapshot: IConnectionDiagnosticsSnapshot;
	private snapshotRequest = 0;
	private pendingHostId: string | undefined;
	private actionError: { readonly hostId: string; readonly message: string } | undefined;

	constructor(
		container: HTMLElement,
		snapshot: IConnectionDiagnosticsSnapshot,
		private readonly triggerDownload: typeof dom.triggerDownload = dom.triggerDownload,
		private readonly options: { readonly enableHostManagement: boolean; readonly rediscoverOnRefresh: boolean },
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
		this.snapshot = snapshot;
		container.classList.add('connection-diagnostics');
		this.message = dom.append(container, dom.$('div.connection-diagnostics-message', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
		this.message.hidden = true;
		this.content = dom.$('div.connection-diagnostics-content');
		this.content.tabIndex = 0;
		this.content.setAttribute('role', 'region');
		this.content.setAttribute('aria-label', localize('connectionDiagnostics.report', "Connection diagnostics report"));
		this.scrollable = this._register(new DomScrollableElement(this.content, {
			className: 'connection-diagnostics-scrollable',
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		// Keep native touch/keyboard scrolling while retaining the workbench scrollbar and wheel handling.
		this.content.style.overflow = '';
		this._register(Gesture.ignoreTarget(this.content));
		this._register(dom.addDisposableListener(this.content, dom.EventType.SCROLL, () => this.scrollable.setScrollPosition({
			scrollTop: this.content.scrollTop,
			scrollLeft: this.content.scrollLeft,
		})));
		dom.append(container, this.scrollable.getDomNode());
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ConnectionDiagnosticsReport.scrollable', () => this.scrollable.scanDomNode()));
		this._register(resizeObserver.observe(this.scrollable.getDomNode()));
		this.render();
		if (this.options.enableHostManagement) {
			this._register(this.diagnosticsService.onDidChangeHostManagement(() => this.scheduleRender()));
		}
	}

	getSnapshot(): IConnectionDiagnosticsSnapshot {
		return this.snapshot;
	}

	focus(): void {
		this.content.focus();
	}

	getFocusTargets(): readonly HTMLElement[] {
		return [this.content, ...this.bodyFocusTargets];
	}

	async refresh(): Promise<void> {
		const request = ++this.snapshotRequest;
		try {
			const discoverySucceeded = !this.options.rediscoverOnRefresh || await this.diagnosticsService.rediscover();
			const snapshot = await this.diagnosticsService.getSnapshot();
			if (this._store.isDisposed || request !== this.snapshotRequest) {
				return;
			}
			this.snapshot = snapshot;
			this.render();
			this.announce(this.options.rediscoverOnRefresh
				? discoverySucceeded
					? localize('connectionDiagnostics.refreshed', "Hosts rediscovered and snapshot refreshed.")
					: localize('connectionDiagnostics.discoveryFailed', "Snapshot refreshed, but one or more host discovery operations failed.")
				: localize('connectionDiagnostics.snapshotRefreshed', "Snapshot refreshed."));
		} catch (error) {
			if (request === this.snapshotRequest) {
				this.announce(localize('connectionDiagnostics.refreshFailed', "Could not refresh connection information. {0}", toErrorMessage(error)));
			}
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
		const focusedSection = dom.isHTMLElement(activeElement) ? activeElement.closest<HTMLElement>('.connection-diagnostics-host-section') : undefined;
		const focusedHostAddress = dom.isHTMLElement(activeElement) ? activeElement.dataset.hostAddress ?? focusedSection?.dataset.hostAddress : undefined;
		const focusedSummary = activeElement?.tagName === 'SUMMARY';
		this.managementStore.clear();
		dom.clearNode(this.content);
		this.bodyFocusTargets.length = 0;
		this.hostFocusTargets.clear();
		const hosts = this.options.enableHostManagement ? this.diagnosticsService.getHostManagementState().hosts : [];
		const hostsByAddress = new Map(hosts.flatMap(host => host.address ? [[host.address, host] as const] : []));
		if (this.options.enableHostManagement) {
			this.renderHiddenHosts(hosts.filter(host => host.hidden));
			dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.liveSummaries', "Host summaries and controls are live. Details and exports use the captured snapshot.");
		}
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.sharing', "Local snapshot, including connection-related Window logs. Known credentials are redacted, but host names, addresses, and messages can contain personal information. Review before sharing.");
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.captured', "Captured: {0}", this.snapshot.capturedAt);
		const snapshotAddresses = new Set(this.snapshot.sections.map(section => section.hostAddress));
		const newHostSections = hosts.filter(host => !host.hidden && host.address && !snapshotAddresses.has(host.address)).map(host => ({
			title: host.label,
			hostAddress: host.address,
			collapsed: false,
			description: localize('connectionDiagnostics.notCaptured', "Not included in the captured snapshot. Refresh to capture details."),
			entries: [],
		}));
		for (const section of [...this.snapshot.sections.filter(section => !section.collapsed), ...newHostSections, ...this.snapshot.sections.filter(section => section.collapsed)]) {
			const element = dom.append(this.content, dom.$(section.collapsed ? 'details.connection-diagnostics-section' : 'section.connection-diagnostics-section'));
			if (section.hostAddress) {
				element.classList.add('connection-diagnostics-host-section');
				element.dataset.hostAddress = section.hostAddress;
			}
			const heading = dom.append(element, dom.$(section.collapsed ? 'summary' : 'h2'));
			heading.textContent = section.title;
			if (section.hostAddress) {
				heading.dataset.hostAddress = section.hostAddress;
			}
			if (section.collapsed) {
				this.bodyFocusTargets.push(heading);
				(element as HTMLDetailsElement).open = openSections.has(section.hostAddress ?? section.title);
				this.managementStore.add(dom.addDisposableListener(element, 'toggle', () => this.scrollable.scanDomNode()));
			}
			const host = section.hostAddress ? hostsByAddress.get(section.hostAddress) : undefined;
			if (host && !host.hidden) {
				heading.textContent = '';
				const row = dom.append(heading, dom.$('span.connection-diagnostics-host-heading'));
				const label = dom.append(row, dom.$('span.connection-diagnostics-host-label'));
				dom.append(label, dom.$('span.connection-diagnostics-host-name')).textContent = host.label;
				dom.append(label, dom.$('span.connection-diagnostics-host-status')).textContent = !host.connectable
					? localize('connectionDiagnostics.onDemand', "Connections managed on demand")
					: host.status === 'disconnected' && host.autoConnectSuppressed
						? localize('connectionDiagnostics.paused', "Disconnected. Automatic connection paused.")
						: this.getHostStatusLabel(host.status);
				const actions = dom.append(row, dom.$('span.connection-diagnostics-host-actions'));
				if (host.address) {
					this.hostFocusTargets.set(host.address, heading);
				}
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
		this.scrollable.scanDomNode();
		this._onDidChangeFocusTargets.fire();
		this.restoreManagementFocus(focusedHostId, focusedHostAddress, focusedAction, focusedSummary);
	}

	private renderHiddenHosts(hosts: readonly IConnectionHostManagementEntry[]): void {
		if (!hosts.length) {
			return;
		}
		const section = dom.append(this.content, dom.$('section.connection-diagnostics-hosts.connection-diagnostics-hidden-hosts'));
		dom.append(section, dom.$('h2')).textContent = localize('connectionDiagnostics.hiddenHosts', "Hidden hosts");
		for (const host of hosts) {
			const row = dom.append(section, dom.$('div.connection-diagnostics-host-row'));
			row.tabIndex = -1;
			if (host.address) {
				row.dataset.hostAddress = host.address;
				this.hostFocusTargets.set(host.address, row);
			}
			const details = dom.append(row, dom.$('div.connection-diagnostics-host-label'));
			dom.append(details, dom.$('div')).textContent = host.label;
			dom.append(details, dom.$('div.connection-diagnostics-host-status')).textContent = localize('connectionDiagnostics.hiddenStatus', "Hidden from host picker");
			const actions = dom.append(row, dom.$('div.connection-diagnostics-host-actions'));
			this.renderHostManagementAction(actions, host);
		}
	}

	private getHostStatusLabel(status: IConnectionHostManagementEntry['status']): string {
		switch (status) {
			case 'connected': return localize('connectionDiagnostics.connected', "Connected");
			case 'connecting': return localize('connectionDiagnostics.connecting', "Connecting");
			case 'reconnecting': return localize('connectionDiagnostics.reconnecting', "Reconnecting");
			case 'disconnected': return localize('connectionDiagnostics.disconnected', "Disconnected");
			case 'incompatible': return localize('connectionDiagnostics.incompatible', "Incompatible");
		}
	}

	private renderHostManagementAction(container: HTMLElement, host: IConnectionHostManagementEntry): void {
		const actions: { action: ConnectionHostManagementAction; label: string; icon: ThemeIcon; ariaLabel: string }[] = [];
		if (host.hidden) {
			actions.push({
				action: 'restore',
				label: localize('connectionDiagnostics.restore', "Restore"),
				ariaLabel: localize('connectionDiagnostics.restoreHost', "Restore {0}", host.label),
				icon: Codicon.refresh,
			});
		} else if (host.connectable && (host.status === 'connected' || host.status === 'connecting' || host.status === 'reconnecting')) {
			actions.push({
				action: 'disconnect',
				label: localize('connectionDiagnostics.disconnect', "Disconnect"),
				ariaLabel: localize('connectionDiagnostics.disconnectHost', "Disconnect {0}", host.label),
				icon: Codicon.circleSlash,
			});
		} else if (host.connectable && host.status === 'disconnected') {
			actions.push({
				action: 'reconnect',
				label: localize('connectionDiagnostics.connect', "Connect"),
				ariaLabel: localize('connectionDiagnostics.connectHost', "Connect {0}", host.label),
				icon: Codicon.plug,
			});
		}
		for (const { action, label, icon, ariaLabel } of actions) {
			const button = this.managementStore.add(new Button(container, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: ariaLabel, ariaLabel }));
			button.label = `$(${icon.id}) ${label}`;
			button.element.dataset.hostId = host.id;
			button.element.dataset.hostAction = action;
			if (host.address) {
				button.element.dataset.hostAddress = host.address;
				this.hostFocusTargets.set(host.address, button.element);
			}
			button.enabled = this.pendingHostId === undefined;
			this.bodyFocusTargets.push(button.element);
			this.managementStore.add(button.onDidClick(() => void this.runHostAction(host.id, action)));
		}
		if (this.pendingHostId === host.id) {
			dom.append(container, dom.$('span.connection-diagnostics-host-status')).textContent = localize('connectionDiagnostics.pending', "Working...");
		}
		if (this.actionError?.hostId === host.id) {
			const error = dom.append(container, dom.$('span.connection-diagnostics-host-error', { role: 'alert' }));
			error.textContent = this.actionError.message;
		}
	}

	private restoreManagementFocus(hostId: string | undefined, hostAddress: string | undefined, action: string | undefined, summary: boolean): void {
		if (action) {
			const exactTarget = this.bodyFocusTargets.find(target => target.dataset.hostId === hostId && target.dataset.hostAction === action);
			if (exactTarget) {
				exactTarget.focus();
				return;
			}
		}
		if (hostAddress && (action || summary)) {
			const target = action ? this.hostFocusTargets.get(hostAddress)
				: this.bodyFocusTargets.find(target => target.dataset.hostAddress === hostAddress && target.tagName === 'SUMMARY');
			(target ?? this.content).focus();
		}
	}

	private scheduleRender(): void {
		if (!this.renderScheduler.value) {
			this.renderScheduler.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.content), () => {
				this.renderScheduler.clear();
				this.render();
			});
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
			const host = this.diagnosticsService.getHostManagementState().hosts.find(host => host.id === hostId);
			await this.diagnosticsService.runHostAction(hostId, action);
			if (action === 'restore') {
				const restored = this.diagnosticsService.getHostManagementState().hosts.some(current => current.address === host?.address && current.selectable);
				this.announce(restored
					? localize('connectionDiagnostics.restored', "Host restored to the picker.")
					: localize('connectionDiagnostics.restoredNotFound', "Host restored, but not found in the latest discovery."));
			}
		} catch (error) {
			this.actionError = { hostId, message: toErrorMessage(error) };
			this.announce(this.actionError.message);
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
		readonly enableHostManagement?: boolean;
		readonly rediscoverOnRefresh?: boolean;
	} = {},
): Promise<void> {
	let report: ConnectionDiagnosticsReport;
	let api: IMobileContentSheetApi;
	return showMobileContentSheet(container, localize('connectionDiagnostics.title', "Connection information"), (body, sheetApi) => {
		const store = new DisposableStore();
		api = sheetApi;
		api.overlay.classList.add('connection-diagnostics-overlay');
		report = store.add(instantiationService.createInstance(ConnectionDiagnosticsReport, body, snapshot, options.triggerDownload, {
			enableHostManagement: options.enableHostManagement === true,
			rediscoverOnRefresh: options.rediscoverOnRefresh === true,
		}));
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
