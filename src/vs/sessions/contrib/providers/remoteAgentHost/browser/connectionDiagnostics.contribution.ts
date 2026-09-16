/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IMobileContentSheetApi } from '../../../../browser/parts/mobile/mobilePickerSheet.js';
import { isPhoneLayout } from '../../../../browser/parts/mobile/mobileLayout.js';
import { CopyConnectionDiagnosticsCommandId, IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, ShowConnectionDiagnosticsCommandId } from './connectionDiagnostics.js';
import './connectionDiagnosticsService.js';
import { ConnectionDiagnosticsReport, showConnectionDiagnosticsSheet } from './connectionDiagnosticsReport.js';

const connectionDiagnosticsFocused = new RawContextKey<boolean>('connectionDiagnosticsFocused', false);

interface IActiveConnectionDiagnostics {
	readonly report: ConnectionDiagnosticsReport;
	readonly overlay: HTMLElement;
	readonly close: () => void;
	readonly returnFocus: HTMLElement | undefined;
	restoreFocus: boolean;
}

export class ConnectionDiagnosticsContribution extends Disposable {
	static readonly ID = 'sessions.connectionDiagnostics';

	private active: IActiveConnectionDiagnostics | undefined;
	private accessibleView: { readonly provider: AccessibleContentProvider; readonly snapshot: IConnectionDiagnosticsSnapshot } | undefined;

	protected get isWebPlatform(): boolean { return isWeb; }

	constructor(
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(toDisposable(() => this.active?.close()));
		this._register(toDisposable(() => this.accessibleView?.provider.dispose()));
		this._register(this.entitlementService.onDidChangeSentiment(() => {
			if (this.entitlementService.sentiment.hidden) {
				this.active?.close();
			}
		}));
	}

	async show(snapshot?: IConnectionDiagnosticsSnapshot, returnFocus?: HTMLElement): Promise<void> {
		if (this._store.isDisposed || this.entitlementService.sentiment.hidden) {
			return;
		}
		if (this.active) {
			this.active.report.focus();
			return;
		}
		const container = this.layoutService.activeContainer;
		const previouslyFocused = returnFocus ?? dom.getActiveElement();
		let active: IActiveConnectionDiagnostics | undefined;
		await showConnectionDiagnosticsSheet(container, snapshot ?? this.diagnosticsService.getSnapshot(), this.instantiationService, {
			autoFocus: false,
			enableHostManagement: this.isWebPlatform,
			rediscoverOnRefresh: this.isWebPlatform,
			onDidCreate: (report, api) => {
				active = this.active = { report, overlay: api.overlay, close: () => api.close(), restoreFocus: true, returnFocus: dom.isHTMLElement(previouslyFocused) ? previouslyFocused : undefined };
				return this.attachModal(container, report, api);
			},
		});
		if (active?.restoreFocus && !this.active && dom.isHTMLElement(previouslyFocused) && previouslyFocused.isConnected) {
			previouslyFocused.focus();
		}
	}

	private attachModal(container: HTMLElement, report: ConnectionDiagnosticsReport, api: IMobileContentSheetApi): DisposableStore {
		const store = new DisposableStore();
		const updateLayoutClass = () => {
			const phoneLayout = isPhoneLayout(this.layoutService);
			api.overlay.classList.toggle('phone-layout', phoneLayout);
			api.overlay.classList.toggle('desktop-layout', !phoneLayout);
		};
		updateLayoutClass();
		store.add(this.layoutService.onDidLayoutMainContainer(updateLayoutClass));
		const context = store.add(this.contextKeyService.createScoped(api.sheet));
		connectionDiagnosticsFocused.bindTo(context).set(true);
		for (const sibling of Array.from(container.children).filter(dom.isHTMLElement)) {
			if (sibling === api.overlay) {
				continue;
			}
			const wasInert = sibling.inert;
			sibling.inert = true;
			store.add(toDisposable(() => sibling.inert = wasInert));
		}
		store.add(toDisposable(() => {
			api.overlay.inert = true;
			api.overlay.setAttribute('aria-hidden', 'true');
			if (this.active?.report === report) {
				this.active = undefined;
			}
		}));
		report.focus();
		if (this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue(AccessibilityVerbositySettingId.ConnectionDiagnostics)) {
			const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			if (keybinding) {
				report.announce(localize('connectionDiagnostics.hint', "Use {0} for connection diagnostics accessibility help.", keybinding));
			}
		}
		return store;
	}

	async copy(): Promise<void> {
		if (this.entitlementService.sentiment.hidden) {
			return;
		}
		if (this.active) {
			return this.active.report.copy();
		}
		try {
			await this.clipboardService.writeText((this.accessibleView?.snapshot ?? this.diagnosticsService.getSnapshot()).text);
			status(localize('connectionDiagnostics.copied', "Diagnostics copied."));
		} catch {
			this.notificationService.warn(localize('connectionDiagnostics.copyFailed', "Could not copy diagnostics. Open Show Connection Diagnostics and try again."));
		}
	}

	getAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider | undefined {
		const active = this.active;
		if (!active) {
			return undefined;
		}
		const snapshot = active.report.getSnapshot();
		const returnFocus = active.returnFocus;
		active.restoreFocus = false;
		// Remove the modal before opening Accessible View, including its Escape handler and focus trap.
		active.overlay.remove();
		active.close();
		const help = [
			this.isWebPlatform
				? localize('connectionDiagnostics.help.webOverview', "Connection information shows live host summaries with Connect and Disconnect beside each host. Expand a host to read its captured diagnostic details. Actions use current host state. An intentional disconnect keeps the host in the picker and pauses automatic connection. The separate Hidden hosts section has Restore actions that return hosts to discovery; restoration does not guarantee a connection.")
				: localize('connectionDiagnostics.help.overview', "Connection diagnostics shows a read-only snapshot of local connection state."),
			this.isWebPlatform
				? localize('connectionDiagnostics.help.webNavigation', "Use Tab and Shift+Tab to move between host actions, header actions, the report, and collapsed sections. Use arrow keys to scroll the focused report. Use Enter or Space to expand client details.")
				: localize('connectionDiagnostics.help.navigation', "Use Tab and Shift+Tab to move between the header actions, report, and collapsed sections. Use arrow keys to scroll the focused report. Use Enter or Space to expand client details."),
			this.isWebPlatform
				? localize('connectionDiagnostics.help.webCopy', "Copy Diagnostics and Download Diagnostics include the entire displayed snapshot, including collapsed sections. Review host names and addresses before sharing. Refresh re-runs host discovery and then captures current local state.")
				: localize('connectionDiagnostics.help.copy', "Copy Diagnostics and Download Diagnostics include the entire displayed snapshot, including collapsed sections. Review host names and addresses before sharing. Refresh reads current local state without discovery, authentication, or connection changes."),
			localize('connectionDiagnostics.help.view', "Open the report as plain text with {0}.", '<keybinding:editor.action.accessibleView>'),
			localize('connectionDiagnostics.help.close', "Escape or Close dismisses diagnostics. Closing this accessible view returns to the diagnostics snapshot."),
		].join('\n\n');
		const provider = new AccessibleContentProvider(
			AccessibleViewProviderId.ConnectionDiagnostics,
			{ type, language: 'plaintext' },
			() => type === AccessibleViewType.Help ? help : snapshot.text,
			() => {
				if (this.accessibleView?.provider === provider) {
					this.accessibleView = undefined;
				}
				void this.show(snapshot, dom.isHTMLElement(returnFocus) ? returnFocus : undefined);
			},
			AccessibilityVerbositySettingId.ConnectionDiagnostics,
		);
		this.accessibleView = { provider, snapshot };
		provider.onDispose = () => {
			if (this.accessibleView?.provider === provider) {
				this.accessibleView = undefined;
			}
		};
		return provider;
	}
}

registerWorkbenchContribution2(ConnectionDiagnosticsContribution.ID, ConnectionDiagnosticsContribution, WorkbenchPhase.Eventually);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ShowConnectionDiagnosticsCommandId,
			title: localize2('connectionDiagnostics.showCommand', "Show Connection Information"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}
	run(_accessor: ServicesAccessor): void {
		void getWorkbenchContribution<ConnectionDiagnosticsContribution>(ConnectionDiagnosticsContribution.ID).show();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CopyConnectionDiagnosticsCommandId,
			title: localize2('connectionDiagnostics.copyCommand', "Copy Connection Diagnostics"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}
	run(_accessor: ServicesAccessor): Promise<void> {
		return getWorkbenchContribution<ConnectionDiagnosticsContribution>(ConnectionDiagnosticsContribution.ID).copy();
	}
});

for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
	AccessibleViewRegistry.register({
		type,
		// The modal must take precedence over the general Agents chat help.
		priority: 125,
		name: 'connectionDiagnostics',
		when: connectionDiagnosticsFocused,
		getProvider: () => getWorkbenchContribution<ConnectionDiagnosticsContribution>(ConnectionDiagnosticsContribution.ID).getAccessibleProvider(type),
	});
}
