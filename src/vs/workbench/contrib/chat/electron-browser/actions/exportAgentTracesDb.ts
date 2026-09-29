/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AgentHostOTelDbSpanExporterEnabledSettingId, AgentHostOTelSpansDbSubPath } from '../../../../../platform/agentHost/common/agentService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';

/**
 * Exports the local OTel span SQLite database produced by `IAgentHostOTelService`
 * (path: `<userDataPath>/agent-host/otel/agent-host-traces.db`). The action is
 * gated on `chat.agentHost.otel.dbSpanExporter.enabled` so it does not appear
 * when DB mode is off — in that case there is nothing to export.
 *
 * The store runs in WAL mode (see `OTelSqliteStore`) and lives in a separate
 * utility process, so we can't safely call `wal_checkpoint` from here. To
 * avoid missing data that still sits in the `-wal` sidecar we also copy
 * `<src>-wal` and `<src>-shm` next to the destination when they exist. The
 * resulting trio is a valid WAL-mode SQLite database that any SQLite reader
 * can open and checkpoint on demand.
 *
 * When invoked programmatically with a `savePath` (URI or filesystem path)
 * pointing to a destination directory, the DB is copied to
 * `<savePath>/agent-host-traces.db` and no save dialog is shown.
 */
export function registerExportAgentTracesDbAction() {
	registerAction2(class ExportAgentTracesDbAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.agentHost.otel.exportAgentTracesDB',
				category: CHAT_CATEGORY,
				title: localize2('exportAgentTracesDB.label', "Export Agent Host Traces Database..."),
				precondition: ContextKeyExpr.equals(`config.${AgentHostOTelDbSpanExporterEnabledSettingId}`, true),
				f1: true,
			});
		}

		async run(accessor: ServicesAccessor, savePath?: URI | string): Promise<void> {
			const fileDialogService = accessor.get(IFileDialogService);
			const fileService = accessor.get(IFileService);
			const notificationService = accessor.get(INotificationService);
			const environmentService = accessor.get(INativeWorkbenchEnvironmentService);

			const sourceUri = joinPath(URI.file(environmentService.userDataPath), ...AgentHostOTelSpansDbSubPath.split('/'));
			if (!(await fileService.exists(sourceUri))) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('exportAgentTracesDB.notFound', "No agent host trace database found yet. Run an agent session with `#chat.agentHost.otel.dbSpanExporter.enabled#` turned on to populate it."),
				});
				return;
			}

			let target: URI | undefined;
			if (savePath) {
				const saveUri = typeof savePath === 'string' ? URI.file(savePath) : savePath;
				target = joinPath(saveUri, 'agent-host-traces.db');
			} else {
				const defaultUri = joinPath(await fileDialogService.defaultFilePath(), 'agent-host-traces.db');
				target = await fileDialogService.showSaveDialog({
					defaultUri,
					filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
				});
			}
			if (!target) {
				return;
			}

			try {
				await fileService.copy(sourceUri, target, true);

				// Also copy the WAL and SHM sidecars when present so the export
				// includes data that hasn't been checkpointed into the main .db.
				for (const suffix of ['-wal', '-shm']) {
					const sidecarSrc = sourceUri.with({ path: sourceUri.path + suffix });
					if (await fileService.exists(sidecarSrc)) {
						const sidecarDest = target.with({ path: target.path + suffix });
						await fileService.copy(sidecarSrc, sidecarDest, true);
					}
				}
			} catch (error) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('exportAgentTracesDB.error', "Failed to export agent host traces database: {0}", error instanceof Error ? error.message : String(error)),
				});
			}
		}
	});
}
