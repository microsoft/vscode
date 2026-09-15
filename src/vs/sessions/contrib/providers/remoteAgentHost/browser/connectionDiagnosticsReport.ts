/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/connectionDiagnostics.css';
import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMobileContentSheetApi, showMobileContentSheet } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot } from './connectionDiagnostics.js';

export class ConnectionDiagnosticsReport extends Disposable {
	private readonly content: HTMLElement;
	private readonly message: HTMLElement;
	private readonly sectionFocusTargets: HTMLElement[] = [];
	private snapshot: IConnectionDiagnosticsSnapshot;

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
	}

	getSnapshot(): IConnectionDiagnosticsSnapshot {
		return this.snapshot;
	}

	focus(): void {
		this.content.focus();
	}

	getFocusTargets(): readonly HTMLElement[] {
		return [this.content, ...this.sectionFocusTargets];
	}

	refresh(): void {
		try {
			this.snapshot = this.diagnosticsService.getSnapshot();
			this.render();
			this.announce(localize('connectionDiagnostics.refreshed', "Snapshot refreshed."));
		} catch {
			this.announce(localize('connectionDiagnostics.refreshFailed', "Could not refresh diagnostics."));
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
		dom.clearNode(this.content);
		this.sectionFocusTargets.length = 0;
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.sharing', "Local snapshot. Review host names and addresses before sharing.");
		dom.append(this.content, dom.$('p.connection-diagnostics-caption')).textContent = localize('connectionDiagnostics.captured', "Captured: {0}", this.snapshot.capturedAt);
		for (const section of [...this.snapshot.sections.filter(section => !section.collapsed), ...this.snapshot.sections.filter(section => section.collapsed)]) {
			const element = dom.append(this.content, dom.$(section.collapsed ? 'details.connection-diagnostics-section' : 'section.connection-diagnostics-section'));
			const heading = dom.append(element, dom.$(section.collapsed ? 'summary' : 'h2'));
			heading.textContent = section.title;
			if (section.collapsed) {
				this.sectionFocusTargets.push(heading);
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
	return showMobileContentSheet(container, localize('connectionDiagnostics.title', "Connection diagnostics"), (body, sheetApi) => {
		const store = new DisposableStore();
		api = sheetApi;
		api.overlay.classList.add('connection-diagnostics-overlay');
		report = store.add(instantiationService.createInstance(ConnectionDiagnosticsReport, body, snapshot, options.triggerDownload));
		api.setBodyFocusTargets(report.getFocusTargets());
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
				case 'refresh':
					report.refresh();
					api.setBodyFocusTargets(report.getFocusTargets());
					return;
			}
		},
	});
}
