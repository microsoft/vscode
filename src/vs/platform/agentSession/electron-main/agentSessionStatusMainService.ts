/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, Tray, Menu, nativeImage, NativeImage } from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isMacintosh, isWindows, isLinux } from '../../../base/common/platform.js';
import { IAgentSessionNativeStatusInfo, IAgentSessionStatusMainService, AgentSessionNativeStatusMode } from '../common/agentSession.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';

type AgentSessionNativeStatusUpdateEvent = {
	platform: 'darwin' | 'win32' | 'linux';
	mode: string;
	hasSession: boolean;
	activeCount: number;
	unreadCount: number;
	attentionCount: number;
};

type AgentSessionNativeStatusUpdateClassification = {
	platform: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The platform where the native status is updated (macOS, Windows, or Linux).' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The current mode of the agent status widget (default, sessionReady, or session).' };
	hasSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether a session is currently active.' };
	activeCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of active agent sessions.' };
	unreadCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of unread agent sessions.' };
	attentionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of sessions needing user attention.' };
	owner: 'joshspicer';
	comment: 'Tracks usage of the native menu bar icon for agent sessions to understand feature adoption and usage patterns.';
};

/**
 * Implementation of agent session status for native menu bar/system tray.
 * On macOS, this updates the Dock icon overlay and menu.
 * On Windows/Linux, this creates a system tray icon with status information.
 */
export class AgentSessionStatusMainService extends Disposable implements IAgentSessionStatusMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IAgentSessionNativeStatusInfo>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private tray: Tray | undefined;
	private currentStatus: IAgentSessionNativeStatusInfo | undefined;
	private badgeIcon: NativeImage | undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
	}

	updateStatus(info: IAgentSessionNativeStatusInfo): void {
		this.currentStatus = info;
		this._onDidChangeStatus.fire(info);

		// Send telemetry
		const platform = isMacintosh ? 'darwin' : isWindows ? 'win32' : 'linux';
		this.telemetryService.publicLog2<AgentSessionNativeStatusUpdateEvent, AgentSessionNativeStatusUpdateClassification>(
			'agentSessionNativeStatusUpdate',
			{
				platform,
				mode: info.mode,
				hasSession: !!info.sessionTitle,
				activeCount: info.activeSessionsCount,
				unreadCount: info.unreadSessionsCount,
				attentionCount: info.attentionNeededCount,
			}
		);

		if (isMacintosh) {
			this.updateMacOSStatus(info);
		} else if (isWindows || isLinux) {
			this.updateSystemTrayStatus(info);
		}
	}

	private updateMacOSStatus(info: IAgentSessionNativeStatusInfo): void {
		// On macOS, update the Dock icon badge and menu
		this.updateDockBadge(info);
		this.updateDockMenu(info);
	}

	private updateDockBadge(info: IAgentSessionNativeStatusInfo): void {
		// Show badge count for unread sessions or sessions needing attention
		const badgeCount = info.attentionNeededCount > 0 ? info.attentionNeededCount : info.unreadSessionsCount;

		if (badgeCount > 0) {
			app.dock?.setBadge(String(badgeCount));
		} else {
			app.dock?.setBadge('');
		}

		// Set overlay icon for sessions in progress (macOS 10.10+)
		if (info.activeSessionsCount > 0 && !this.badgeIcon) {
			// Create a small overlay icon to indicate activity
			// We'll use a simple colored circle
			this.badgeIcon = this.createOverlayIcon();
			app.dock?.setIcon(this.badgeIcon);
		} else if (info.activeSessionsCount === 0 && this.badgeIcon) {
			// Clear the overlay when no active sessions
			// Reset to default icon
			this.badgeIcon = undefined;
			// Electron will restore the default app icon automatically
		}
	}

	private updateDockMenu(info: IAgentSessionNativeStatusInfo): void {
		const dockMenuItems: Electron.MenuItemConstructorOptions[] = [];

		// Show session title if in session mode
		if (info.mode === AgentSessionNativeStatusMode.Session && info.sessionTitle) {
			dockMenuItems.push({
				label: `Session: ${info.sessionTitle}`,
				enabled: false
			});
			dockMenuItems.push({ type: 'separator' });
		} else if (info.mode === AgentSessionNativeStatusMode.SessionReady && info.sessionTitle) {
			dockMenuItems.push({
				label: `Ready: ${info.sessionTitle}`,
				enabled: false
			});
			dockMenuItems.push({ type: 'separator' });
		}

		// Add status information
		if (info.attentionNeededCount > 0) {
			const needsText = info.attentionNeededCount === 1 ? 'needs' : 'need';
			const sessionText = info.attentionNeededCount === 1 ? 'session' : 'sessions';
			dockMenuItems.push({
				label: `⚠️ ${info.attentionNeededCount} ${sessionText} ${needsText} attention`,
				enabled: false
			});
		}

		if (info.activeSessionsCount > 0) {
			const sessionText = info.activeSessionsCount === 1 ? 'session' : 'sessions';
			dockMenuItems.push({
				label: `🔄 ${info.activeSessionsCount} ${sessionText} in progress`,
				enabled: false
			});
		}

		if (info.unreadSessionsCount > 0) {
			const sessionText = info.unreadSessionsCount === 1 ? 'session' : 'sessions';
			dockMenuItems.push({
				label: `💬 ${info.unreadSessionsCount} unread ${sessionText}`,
				enabled: false
			});
		}

		if (dockMenuItems.length === 0) {
			dockMenuItems.push({
				label: 'No active agent sessions',
				enabled: false
			});
		}

		const dockMenu = Menu.buildFromTemplate(dockMenuItems);
		app.dock?.setMenu(dockMenu);
	}

	private updateSystemTrayStatus(info: IAgentSessionNativeStatusInfo): void {
		// On Windows/Linux, use system tray icon
		if (!this.tray) {
			this.createSystemTray();
		}

		if (!this.tray) {
			return;
		}

		// Update tray icon based on status
		const icon = this.getTrayIcon(info);
		if (icon) {
			this.tray.setImage(icon);
		}

		// Update tooltip
		const tooltip = this.getTrayTooltip(info);
		this.tray.setToolTip(tooltip);

		// Update context menu
		const contextMenu = this.createTrayContextMenu(info);
		this.tray.setContextMenu(contextMenu);
	}

	private createSystemTray(): void {
		try {
			// Create tray icon with initial icon
			const icon = this.getDefaultTrayIcon();
			if (icon) {
				this.tray = new Tray(icon);
				this.tray.setToolTip('VS Code Agent Sessions');
			}
		} catch (error) {
			console.error('Failed to create system tray icon:', error);
		}
	}

	private getTrayIcon(info: IAgentSessionNativeStatusInfo): NativeImage | undefined {
		// Use different icons based on status
		// For now, use the default icon - in a real implementation, you would
		// want to use different icons to indicate different states
		return this.getDefaultTrayIcon();
	}

	private getDefaultTrayIcon(): NativeImage | undefined {
		try {
			// For now, return an empty icon - in production, you would use an actual icon file
			// The icon should be located in the resources folder
			return nativeImage.createEmpty();
		} catch (error) {
			console.error('Failed to load tray icon:', error);
			return undefined;
		}
	}

	private getTrayTooltip(info: IAgentSessionNativeStatusInfo): string {
		const parts: string[] = ['VS Code Agent Sessions'];

		if (info.mode === AgentSessionNativeStatusMode.Session && info.sessionTitle) {
			parts.push(`Session: ${info.sessionTitle}`);
		} else if (info.mode === AgentSessionNativeStatusMode.SessionReady && info.sessionTitle) {
			parts.push(`Ready: ${info.sessionTitle}`);
		}

		if (info.attentionNeededCount > 0) {
			parts.push(`${info.attentionNeededCount} need${info.attentionNeededCount === 1 ? 's' : ''} attention`);
		}

		if (info.activeSessionsCount > 0) {
			parts.push(`${info.activeSessionsCount} in progress`);
		}

		if (info.unreadSessionsCount > 0) {
			parts.push(`${info.unreadSessionsCount} unread`);
		}

		return parts.join(' • ');
	}

	private createTrayContextMenu(info: IAgentSessionNativeStatusInfo): Menu {
		const menuItems: Electron.MenuItemConstructorOptions[] = [];

		// Session title if in session mode
		if (info.mode === AgentSessionNativeStatusMode.Session && info.sessionTitle) {
			menuItems.push({
				label: `Session: ${info.sessionTitle}`,
				enabled: false
			});
			menuItems.push({ type: 'separator' });
		} else if (info.mode === AgentSessionNativeStatusMode.SessionReady && info.sessionTitle) {
			menuItems.push({
				label: `Ready: ${info.sessionTitle}`,
				enabled: false
			});
			menuItems.push({ type: 'separator' });
		}

		// Status information
		if (info.attentionNeededCount > 0) {
			const needsText = info.attentionNeededCount === 1 ? 'needs' : 'need';
			const sessionText = info.attentionNeededCount === 1 ? 'session' : 'sessions';
			menuItems.push({
				label: `⚠️ ${info.attentionNeededCount} ${sessionText} ${needsText} attention`,
				enabled: false
			});
		}

		if (info.activeSessionsCount > 0) {
			const sessionText = info.activeSessionsCount === 1 ? 'session' : 'sessions';
			menuItems.push({
				label: `🔄 ${info.activeSessionsCount} ${sessionText} in progress`,
				enabled: false
			});
		}

		if (info.unreadSessionsCount > 0) {
			const sessionText = info.unreadSessionsCount === 1 ? 'session' : 'sessions';
			menuItems.push({
				label: `💬 ${info.unreadSessionsCount} unread ${sessionText}`,
				enabled: false
			});
		}

		if (menuItems.length === 0) {
			menuItems.push({
				label: 'No active agent sessions',
				enabled: false
			});
		}

		return Menu.buildFromTemplate(menuItems);
	}

	private createOverlayIcon(): NativeImage {
		// Create a simple colored circle as an overlay icon
		// In production, you would want to use an actual icon file
		const size = 16;
		const canvas = { width: size, height: size };

		// Create a simple bitmap - this is a placeholder
		// In a real implementation, you would load an actual icon file
		return nativeImage.createEmpty();
	}

	override dispose(): void {
		if (this.tray) {
			this.tray.destroy();
			this.tray = undefined;
		}

		if (isMacintosh && app.dock) {
			app.dock.setBadge('');
		}

		super.dispose();
	}
}
