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
 * The action copies the live DB file directly. SQLite handles concurrent reads
 * cleanly when the writer is in WAL mode (see `OTelSqliteStore`), so the file
 * remains a valid SQLite database even if the agent host is mid-write.
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

		async run(accessor: ServicesAccessor): Promise<void> {
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

			const defaultUri = joinPath(await fileDialogService.defaultFilePath(), 'agent-host-traces.db');
			const target = await fileDialogService.showSaveDialog({
				defaultUri,
				filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
			});
			if (!target) {
				return;
			}

			try {
				await fileService.copy(sourceUri, target, true);
			} catch (error) {
				notificationService.notify({
					severity: Severity.Error,
					message: localize('exportAgentTracesDB.error', "Failed to export agent host traces database: {0}", error instanceof Error ? error.message : String(error)),
				});
			}
		}
	});
}
