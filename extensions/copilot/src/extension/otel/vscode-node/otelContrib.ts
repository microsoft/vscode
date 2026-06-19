/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import { ConfigKey } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { DEFAULT_OTLP_ENDPOINT } from '../../../platform/otel/common/otelConfig';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IOTelSqliteStore, type OTelSqliteStore } from '../../../platform/otel/node/sqlite/otelSqliteStore';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import type { IExtensionContribution } from '../../common/contributions';

const OPEN_OTEL_SETTINGS_COMMAND = 'github.copilot.chat.otel.openSettings';
const PILL_ACTIVE_COMMAND = 'github.copilot.chat.otel.statusActive';
const PILL_CAPTURING_COMMAND = 'github.copilot.chat.otel.statusCapturing';
const DISMISS_CAPTURE_NOTIFICATION_COMMAND = 'github.copilot.chat.otel.dismissCaptureNotification';
const CHAT_STATUS_ITEM_ID = 'copilot.otelStatus';
const CHAT_NOTIFICATION_ID = 'copilot.otelStatus';
// Per-workspace, per-endpoint: Workspace Trust ≠ consent to send chat content to a collector.
const CAPTURE_CONTENT_CONSENT_KEY = 'copilot.otel.captureContentConsent';
const CAPTURE_NOTIFICATION_DISMISSED_KEY = 'copilot.otel.captureNotificationDismissed';
const OTEL_STATE_CONTEXT_KEY = 'github.copilot.otel.state';
type OTelUiState = 'off' | 'active' | 'capturing';

interface CaptureContentConsentMap {
	[endpoint: string]: 'allowed';
}

interface CaptureNotificationDismissalMap {
	[endpoint: string]: true;
}

/**
 * Lifecycle contribution that logs OTel status, wires the SQLite store,
 * surfaces the active configuration in the UI, and shuts down the SDK on
 * extension deactivation.
 */
export class OTelContrib extends Disposable implements IExtensionContribution {

	// Suppresses the generic reload-required toast when we trigger our own auto-reload.
	private _suppressNextReloadPrompt = false;

	constructor(
		@IOTelService private readonly _otelService: IOTelService,
		@IOTelSqliteStore private readonly _sqliteStore: OTelSqliteStore,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
	) {
		super();
		if (this._otelService.config.enabled) {
			this._logService.info(`[OTel] Instrumentation enabled — exporter=${this._otelService.config.exporterType} endpoint=${this._otelService.config.otlpEndpoint} captureContent=${this._otelService.config.captureContent}`);
		} else {
			this._logService.trace('[OTel] Instrumentation disabled');
		}

		this._fireActivatedTelemetry();
		this._registerOpenSettingsCommand();
		this._logEndpointInfo();
		this._installVisibilityIndicators();
		this._configureTerminalEnv();

		this._register(vscode.commands.registerCommand('github.copilot.chat.otel.flush', async () => {
			if (!this._otelService.config.enabled) {
				return;
			}
			this._logService.info('[OTel] Flush requested — exporting pending traces, metrics, and events');
			await this._otelService.flush();
			this._logService.info('[OTel] Flush complete');
		}));

		// Prompt for reload when OTel settings change — these are read once at
		// activation and the OTel SDK cannot be reconfigured at runtime.
		this._watchForReloadRequiredChanges();

		// Export the agent-traces.db file.
		// Programmatic (eval harness): called with savePath URI or string → copies DB there.
		// Interactive (command palette): shows save dialog with default filename.
		this._register(vscode.commands.registerCommand('github.copilot.chat.otel.exportAgentTracesDB', async (savePath?: vscode.Uri | string) => {
			const dbPath = this._sqliteStore.dbPath;
			if (!dbPath) {
				return;
			}
			const src = vscode.Uri.file(dbPath);
			let dest: vscode.Uri;

			if (savePath) {
				const saveUri = typeof savePath === 'string' ? vscode.Uri.file(savePath) : savePath;
				dest = vscode.Uri.joinPath(saveUri, 'agent-traces.db');
			} else {
				// Interactive: show save dialog with default filename
				const result = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.file(os.homedir() + '/agent-traces.db'),
					filters: { 'SQLite Database': ['db'] },
					title: 'Export Agent Traces DB',
				});
				if (!result) {
					return;
				}
				dest = result;
			}

			// Flush BatchSpanProcessors so all buffered spans are written to SQLite
			// before we checkpoint + copy. Without this, the root invoke_agent span
			// (which ends last) may still be in the processor's buffer.
			await this._otelService.flush();

			// Checkpoint WAL so all data is flushed into the main .db file before copying.
			// Without this, the copy would be empty because data lives in the -wal file.
			this._sqliteStore.checkpoint();

			await vscode.workspace.fs.copy(src, dest, { overwrite: true });
			this._logService.info(`[OTel] Exported agent-traces.db to ${dest.fsPath}`);

			/* __GDPR__
				"otel.exportAgentTracesDB" : {
					"owner": "zhichli",
					"comment": "Fired when the user exports the agent-traces.db file",
					"interactive": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the export was interactive (save dialog) or programmatic (eval harness)" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('otel.exportAgentTracesDB', {
				interactive: String(!savePath),
			});
		}));
	}

	private _watchForReloadRequiredChanges(): void {
		const reloadSettings = [
			ConfigKey.Advanced.OTelEnabled,
			ConfigKey.Advanced.OTelExporterType,
			ConfigKey.Advanced.OTelOtlpEndpoint,
			ConfigKey.Advanced.OTelCaptureContent,
			ConfigKey.Advanced.OTelOutfile,
			ConfigKey.Advanced.OTelDbSpanExporter,
		];

		// Snapshot initial values to avoid prompting when the setting hasn't actually changed
		const initialValues = new Map(reloadSettings.map(s => [s.fullyQualifiedId, vscode.workspace.getConfiguration().get(s.fullyQualifiedId)]));

		this._register(vscode.workspace.onDidChangeConfiguration(async e => {
			const currentConfig = vscode.workspace.getConfiguration();
			const changedSettings = reloadSettings.filter(s =>
				e.affectsConfiguration(s.fullyQualifiedId) &&
				currentConfig.get(s.fullyQualifiedId) !== initialValues.get(s.fullyQualifiedId)
			);
			if (changedSettings.length === 0) {
				return;
			}
			// Avoid double-prompting when we already triggered our own reload.
			if (this._suppressNextReloadPrompt) {
				this._suppressNextReloadPrompt = false;
				return;
			}
			const endpointSetting = ConfigKey.Advanced.OTelOtlpEndpoint;
			const endpointChanged = changedSettings.some(s => s.fullyQualifiedId === endpointSetting.fullyQualifiedId);
			const reloadWindowLabel = vscode.l10n.t("Reload Window");
			const message = endpointChanged
				? vscode.l10n.t("Copilot OTel endpoint will change to {0} after reload.", String(currentConfig.get(endpointSetting.fullyQualifiedId)))
				: vscode.l10n.t("Copilot OTel settings changed - a reload is required for the change to take effect.");
			const selection = await vscode.window.showInformationMessage(
				message,
				reloadWindowLabel,
			);
			if (selection === reloadWindowLabel) {
				await vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		}));
	}

	/**
	 * Surfaces the active OTel configuration in the UI: a row in the Copilot
	 * Chat status dashboard, plus (when broadcasting) a chat-input banner.
	 */
	private _installVisibilityIndicators(): void {
		const config = this._otelService.config;
		void vscode.commands.executeCommand('setContext', OTEL_STATE_CONTEXT_KEY, this._computeUiState());

		// Only show broadcast indicators when the user explicitly opted in;
		// db-only / debug-panel modes don't send data off-machine.
		if (!config.enabledExplicitly) {
			return;
		}

		this._register(vscode.commands.registerCommand(PILL_ACTIVE_COMMAND, () =>
			vscode.commands.executeCommand(OPEN_OTEL_SETTINGS_COMMAND)
		));
		this._register(vscode.commands.registerCommand(PILL_CAPTURING_COMMAND, () =>
			vscode.commands.executeCommand(OPEN_OTEL_SETTINGS_COMMAND)
		));

		const chatStatusItem = this._register(vscode.window.createChatStatusItem(CHAT_STATUS_ITEM_ID));
		this._refreshChatStatusItem(chatStatusItem);

		let chatNotification: vscode.ChatInputNotification | undefined;
		const ensureChatNotification = (): vscode.ChatInputNotification => {
			if (!chatNotification) {
				chatNotification = vscode.chat.createInputNotification(CHAT_NOTIFICATION_ID);
				this._register({ dispose: () => chatNotification?.dispose() });
			}
			return chatNotification;
		};

		this._register(vscode.commands.registerCommand(DISMISS_CAPTURE_NOTIFICATION_COMMAND, async (endpoint?: string) => {
			const target = endpoint ?? this._otelService.config.otlpEndpoint;
			await this._persistCaptureNotificationDismissal(target);
			chatNotification?.hide();
			/* __GDPR__
				"otel.captureNotificationDismissed" : {
					"owner": "zhichli",
					"comment": "Fired when the user permanently dismisses the chat-input capture-content notification for the current workspace"
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('otel.captureNotificationDismissed');
		}));
		this._refreshChatNotification(ensureChatNotification);

		void this._maybePromptForCaptureContentConsent();
	}

	private _computeUiState(): OTelUiState {
		const config = this._otelService.config;
		if (!config.enabledExplicitly) {
			return 'off';
		}
		const capturing = config.captureContent
			&& config.exporterType !== 'console'
			&& config.exporterType !== 'file';
		return capturing ? 'capturing' : 'active';
	}

	private _refreshChatStatusItem(item: vscode.ChatStatusItem): void {
		const config = this._otelService.config;
		item.title = vscode.l10n.t('OpenTelemetry');
		item.description = '';

		const yes = vscode.l10n.t('On');
		const no = vscode.l10n.t('Off');
		const escapeCell = (s: string) => s.replace(/\|/g, '\\|');
		const fileLink = (p: string, displayText?: string) => {
			const uri = vscode.Uri.file(p).toString();
			const text = escapeCell(displayText ?? p);
			return `[${text}](${uri} "${escapeCell(p)}")`;
		};
		const urlLink = (url: string, displayText?: string) => {
			const text = escapeCell(displayText ?? url);
			return `[${text}](${url} "${escapeCell(url)}")`;
		};
		const rows: Array<{ readonly label: string; readonly value: string }> = [
			{ label: vscode.l10n.t('Capture content'), value: config.captureContent ? yes : no },
		];
		// db-only mode uses NoopSpanExporter; suppress endpoint/exporter rows.
		if (config.enabledExplicitly) {
			rows.push({ label: vscode.l10n.t('Endpoint'), value: urlLink(config.otlpEndpoint) });
			// Hide the /dev/null sentinel exporter (internal, not user-controlled).
			if (!(config.exporterType === 'file' && config.fileExporterPath === os.devNull)) {
				rows.push({ label: vscode.l10n.t('Exporter type'), value: escapeCell(config.exporterType) });
			}
		}
		if (config.enabledExplicitly && config.fileExporterPath && config.fileExporterPath !== os.devNull) {
			const fileBaseName = config.fileExporterPath.replace(/^.*[\\/]/, '');
			rows.push({ label: vscode.l10n.t('Outfile'), value: fileLink(config.fileExporterPath, fileBaseName) });
		}
		if (config.dbSpanExporter) {
			const dbPath = this._sqliteStore?.dbPath;
			const dbDisplay = dbPath ? dbPath.replace(/^.*[\\/]/, '') : '';
			rows.push({
				label: vscode.l10n.t('Local Store'),
				value: dbPath ? fileLink(dbPath, dbDisplay) : yes,
			});
		}
		// Markdown table requires a header row; popup CSS hides the empty thead.
		const lines: string[] = [
			`|     |     |`,
			`| --- | --- |`,
			...rows.map(({ label, value }) => `| ${escapeCell(label)} | ${value} |`),
		];
		item.detail = lines.join('\n');
		item.show();
	}

	private _refreshChatNotification(ensureChatNotification: () => vscode.ChatInputNotification): void {
		const config = this._otelService.config;
		// Only warn when content actually broadcasts off-device.
		const captureWarning = config.enabledExplicitly
			&& config.captureContent
			&& config.exporterType !== 'console'
			&& config.exporterType !== 'file';
		if (!captureWarning) {
			return;
		}
		if (this._isCaptureNotificationDismissed(config.otlpEndpoint)) {
			return;
		}
		const notification = ensureChatNotification();
		notification.severity = vscode.ChatInputNotificationSeverity.Warning;
		notification.message = vscode.l10n.t('Agent being monitored via OpenTelemetry');
		notification.description = vscode.l10n.t('Chat content is being sent to {0}.', this._formatEndpointHost(config.otlpEndpoint));
		notification.actions = [
			{
				label: vscode.l10n.t("Don't Show Again"),
				commandId: DISMISS_CAPTURE_NOTIFICATION_COMMAND,
				commandArgs: [config.otlpEndpoint],
			},
			{ label: vscode.l10n.t('Manage'), commandId: OPEN_OTEL_SETTINGS_COMMAND },
		];
		notification.dismissible = true;
		notification.autoDismissOnMessage = false;
		notification.show();
	}

	private _isCaptureNotificationDismissed(endpoint: string): boolean {
		const dismissals = this._extensionContext.workspaceState.get<CaptureNotificationDismissalMap>(CAPTURE_NOTIFICATION_DISMISSED_KEY) ?? {};
		return dismissals[endpoint] === true;
	}

	private async _persistCaptureNotificationDismissal(endpoint: string): Promise<void> {
		const dismissals = this._extensionContext.workspaceState.get<CaptureNotificationDismissalMap>(CAPTURE_NOTIFICATION_DISMISSED_KEY) ?? {};
		if (dismissals[endpoint] === true) {
			return;
		}
		const updated: CaptureNotificationDismissalMap = { ...dismissals, [endpoint]: true };
		await this._extensionContext.workspaceState.update(CAPTURE_NOTIFICATION_DISMISSED_KEY, updated);
	}

	/**
	 * Disclosure modal shown when capture is broadcasting to an OTLP collector.
	 * The SDK has already initialized when this fires, so the modal documents
	 * reality and lets the user keep, manage, or disable+reload.
	 */
	private async _maybePromptForCaptureContentConsent(): Promise<void> {
		const config = this._otelService.config;
		if (!config.captureContent || !config.enabled || !config.enabledExplicitly) {
			return;
		}
		if (config.exporterType === 'console' || config.exporterType === 'file') {
			return;
		}
		const endpoint = config.otlpEndpoint;
		const consents = this._extensionContext.workspaceState.get<CaptureContentConsentMap>(CAPTURE_CONTENT_CONSENT_KEY) ?? {};
		if (consents[endpoint] === 'allowed') {
			return;
		}

		const okLabel = vscode.l10n.t('OK');
		const manageLabel = vscode.l10n.t('Manage');
		const message = vscode.l10n.t('Copilot Chat is sending conversation content to {0}.', endpoint);
		const detail = vscode.l10n.t(
			'This setting is configured in your settings and is taking effect now \u2014 capture is active.\n\n\u2022 OK: keep the setting and continue capturing.\n\u2022 Manage: open OpenTelemetry settings to review or change the configuration.\n\u2022 Cancel or Esc: disable capture and reload the window.'
		);
		const selection = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			okLabel,
			manageLabel,
		);
		/* __GDPR__
			"otel.captureContentConsent" : {
				"owner": "zhichli",
				"comment": "Records the user's response to the captureContent disclosure modal",
				"choice": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "User choice: ok, manage, or cancel (Esc/dismiss)" },
				"enabledVia": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How OTel was enabled when the prompt fired" }
			}
		*/
		if (selection === okLabel) {
			const updated: CaptureContentConsentMap = { ...consents, [endpoint]: 'allowed' };
			await this._extensionContext.workspaceState.update(CAPTURE_CONTENT_CONSENT_KEY, updated);
			this._telemetryService.sendMSFTTelemetryEvent('otel.captureContentConsent', { choice: 'ok', enabledVia: config.enabledVia });
			return;
		}
		if (selection === manageLabel) {
			await vscode.commands.executeCommand(OPEN_OTEL_SETTINGS_COMMAND);
			this._telemetryService.sendMSFTTelemetryEvent('otel.captureContentConsent', { choice: 'manage', enabledVia: config.enabledVia });
			return;
		}
		// Cancel / Esc: disable capture and reload.
		await this._disableCaptureAndReload(config.enabledVia);
	}

	/**
	 * Flip `OTelCaptureContent` off at its effective scope (folder → workspace
	 * → global), then reload. Writing to `Global` would not override a value
	 * pinned in workspace settings.
	 */
	private async _disableCaptureAndReload(enabledVia: string): Promise<void> {
		this._telemetryService.sendMSFTTelemetryEvent('otel.captureContentConsent', { choice: 'cancel', enabledVia });
		const settingId = ConfigKey.Advanced.OTelCaptureContent.fullyQualifiedId;
		const inspected = vscode.workspace.getConfiguration().inspect<boolean>(settingId);
		let target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global;
		if (inspected?.workspaceFolderValue !== undefined) {
			target = vscode.ConfigurationTarget.WorkspaceFolder;
		} else if (inspected?.workspaceValue !== undefined) {
			target = vscode.ConfigurationTarget.Workspace;
		}
		this._suppressNextReloadPrompt = true;
		try {
			await vscode.workspace.getConfiguration().update(settingId, false, target);
		} catch (err) {
			this._suppressNextReloadPrompt = false;
			this._logService.warn(`[OTel] Failed to disable captureContent: ${String(err)}`);
			return;
		}
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
	}

	private _logEndpointInfo(): void {
		const config = this._otelService.config;
		if (!config.enabled || !config.enabledExplicitly || !config.captureContent) {
			return;
		}
		if (config.exporterType === 'console' || config.exporterType === 'file') {
			return;
		}
		let host: string | undefined;
		try {
			host = new URL(config.otlpEndpoint).hostname.toLowerCase();
		} catch {
			this._logService.warn(`[OTel] captureContent is on but the OTLP endpoint is not a valid URL: ${config.otlpEndpoint}`);
			return;
		}
		const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
		if (!isLocal) {
			this._logService.info(`[OTel] captureContent is enabled; conversation content will be sent to ${config.otlpEndpoint}.`);
		}
	}

	/**
	 * Mirror the resolved OTel config into integrated terminals via
	 * `environmentVariableCollection`, so terminals opened before the SDK
	 * boots still see user-controlled values.
	 */
	private _configureTerminalEnv(): void {
		const collection = this._extensionContext.environmentVariableCollection;
		const otelKeys = [
			'COPILOT_OTEL_ENABLED',
			'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
			'OTEL_EXPORTER_OTLP_ENDPOINT',
			'COPILOT_OTEL_ENDPOINT',
			'COPILOT_OTEL_EXPORTER_TYPE',
			'COPILOT_OTEL_FILE_EXPORTER_PATH',
		];
		// Clear prior overrides before re-applying.
		for (const key of otelKeys) {
			collection.delete(key);
		}

		const config = this._otelService.config;
		if (!config.enabledExplicitly) {
			return;
		}

		collection.replace('COPILOT_OTEL_ENABLED', 'true');
		if (config.otlpEndpoint) {
			collection.replace('OTEL_EXPORTER_OTLP_ENDPOINT', config.otlpEndpoint);
		}
		collection.replace('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', String(config.captureContent));
	}

	private _registerOpenSettingsCommand(): void {
		this._register(vscode.commands.registerCommand(OPEN_OTEL_SETTINGS_COMMAND, async () => {
			await this._openOTelSettingsAtEffectiveScope();
		}));
	}

	/**
	 * Open Settings at the deepest scope where any OTel setting is configured
	 * (folder → workspace → user). Writing at the wrong scope would not
	 * override a value pinned in workspace settings.
	 */
	private async _openOTelSettingsAtEffectiveScope(): Promise<void> {
		const query = 'github.copilot.chat.otel';
		// Probe across multiple OTel settings, not just captureContent: any of
		// them may pin scope while captureContent stays at default.
		const probeSettings = [
			ConfigKey.Advanced.OTelCaptureContent.fullyQualifiedId,
			ConfigKey.Advanced.OTelEnabled.fullyQualifiedId,
			ConfigKey.Advanced.OTelOtlpEndpoint.fullyQualifiedId,
			ConfigKey.Advanced.OTelExporterType.fullyQualifiedId,
		];
		const config = vscode.workspace.getConfiguration();
		const isFolderScoped = probeSettings.some(id => config.inspect(id)?.workspaceFolderValue !== undefined);
		const isWorkspaceScoped = probeSettings.some(id => config.inspect(id)?.workspaceValue !== undefined);
		if (isFolderScoped) {
			await vscode.commands.executeCommand('workbench.action.openFolderSettings', query);
			return;
		}
		if (isWorkspaceScoped) {
			await vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', query);
			return;
		}
		await vscode.commands.executeCommand('workbench.action.openSettings', query);
	}

	private _formatEndpointHost(endpoint: string): string {
		try {
			const url = new URL(endpoint);
			return url.host || url.origin || endpoint;
		} catch {
			return endpoint;
		}
	}

	override dispose(): void {
		// Close SQLite store before OTel shutdown
		this._sqliteStore.close();
		if (this._otelService.config.enabled) {
			this._logService.info('[OTel] Shutting down — flushing pending traces, metrics, and events');
		}
		this._otelService.shutdown().catch((err: Error) => {
			this._logService.error('[OTel] Error during shutdown:', String(err));
		});
		super.dispose();
	}

	private _fireActivatedTelemetry(): void {
		const config = this._otelService.config;
		/* __GDPR__
			"otel.activated" : {
				"owner": "zhichli",
				"comment": "Fired once at activation to capture OTel configuration for adoption tracking",
				"enabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the full OTel SDK is loaded" },
				"enabledVia": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How OTel was enabled: envVar, setting, otlpEndpointEnvVar, dbSpanExporterOnly, or disabled" },
				"dbSpanExporter": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the SQLite local DB span exporter is enabled" },
				"exporterType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The OTel exporter type: otlp-grpc, otlp-http, console, or file" },
				"captureContent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether prompt/response content capture is enabled" },
				"protocol": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "OTLP protocol: grpc or http" },
				"hasCustomEndpoint": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a non-default OTLP endpoint was configured" },
				"hasCustomServiceName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether OTEL_SERVICE_NAME was customized from the default" },
				"hasResourceAttributes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether custom OTEL_RESOURCE_ATTRIBUTES were set" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('otel.activated', {
			enabled: String(config.enabled),
			enabledVia: config.enabledVia,
			dbSpanExporter: String(config.dbSpanExporter),
			exporterType: config.exporterType,
			captureContent: String(config.captureContent),
			protocol: config.otlpProtocol,
			hasCustomEndpoint: String(config.enabled && config.otlpEndpoint !== DEFAULT_OTLP_ENDPOINT && config.otlpEndpoint !== DEFAULT_OTLP_ENDPOINT + '/'),
			hasCustomServiceName: String(config.serviceName !== 'copilot-chat'),
			hasResourceAttributes: String(Object.keys(config.resourceAttributes).length > 0),
		});
	}
}
