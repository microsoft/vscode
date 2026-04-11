/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { DEFAULT_OTLP_ENDPOINT } from '../../../platform/otel/common/otelConfig';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IOTelSqliteStore, type OTelSqliteStore } from '../../../platform/otel/node/sqlite/otelSqliteStore';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import type { IExtensionContribution } from '../../common/contributions';

/**
 * Lifecycle contribution that logs OTel status, wires the SQLite store,
 * and shuts down the SDK on extension deactivation.
 */
export class OTelContrib extends Disposable implements IExtensionContribution {

	constructor(
		@IOTelService private readonly _otelService: IOTelService,
		@IOTelSqliteStore private readonly _sqliteStore: OTelSqliteStore,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		if (this._otelService.config.enabled) {
			this._logService.info(`[OTel] Instrumentation enabled — exporter=${this._otelService.config.exporterType} endpoint=${this._otelService.config.otlpEndpoint} captureContent=${this._otelService.config.captureContent}`);
		} else {
			this._logService.trace('[OTel] Instrumentation disabled');
		}

		this._fireActivatedTelemetry();

		this._register(vscode.commands.registerCommand('github.copilot.chat.otel.flush', async () => {
			if (!this._otelService.config.enabled) {
				return;
			}
			this._logService.info('[OTel] Flush requested — exporting pending traces, metrics, and events');
			await this._otelService.flush();
			this._logService.info('[OTel] Flush complete');
		}));

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
