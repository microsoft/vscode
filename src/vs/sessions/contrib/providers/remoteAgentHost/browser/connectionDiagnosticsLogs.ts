/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { formatConnectionDiagnosticError, getConnectionDiagnosticError, sanitizeConnectionDiagnosticText } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IConnectionDiagnosticsSection } from './connectionDiagnostics.js';

const MAX_LOG_BYTES = 128 * 1024;
const MAX_LOG_LINES = 200;

/** Only lifecycle messages are exported; protocol payloads, auth dumps and multiline continuations are excluded. */
export function selectConnectionLogLines(text: string): readonly string[] {
	const lifecycle = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[(?:trace|debug|info|warning|error|critical)\] \[(?:RemoteAgentHost|RemoteAgentHostProtocol|BrowserTunnelAgentHost|WebTunnelAgentHost|TunnelAgentHost)\] (?:Connecting|Connected|Reconnecting|Reconnected|Re-establishing|Re-established|Connection closed|Transport lost|Reconnect attempt failed|Automatic reconnect|Scheduling reconnect|Stopped reconnecting|Not reconnecting|Liveness:|Failed to (?:list|enumerate|create a connection|connect|get)|Discovery (?:complete|failed)|Silent status check|Tunnel transport closed|Found \d+ tunnel)/;
	return text.split(/\r?\n/)
		.filter(line => lifecycle.test(line))
		.slice(-MAX_LOG_LINES)
		.map(line => sanitizeConnectionDiagnosticText(line));
}

export async function collectConnectionLogs(fileService: IFileService, logFile: URI): Promise<IConnectionDiagnosticsSection> {
	const entries = [{ label: localize('diagnostics.logsCaptured', "Collection started at"), value: new Date().toISOString() }];
	try {
		const stat = await fileService.stat(logFile);
		const position = Math.max(0, stat.size - MAX_LOG_BYTES);
		const result = await fileService.readFile(logFile, { position, length: MAX_LOG_BYTES });
		let text = result.value.toString();
		if (position > 0) {
			// The bounded tail may start mid-line or mid-codepoint.
			const newline = text.indexOf('\n');
			text = newline === -1 ? '' : text.slice(newline + 1);
		}
		const lines = selectConnectionLogLines(text);
		entries.push({
			label: localize('diagnostics.logMessages', "Messages"),
			value: lines.length ? lines.join('\n') : localize('diagnostics.noLogLines', "No matching connection lifecycle lines were found in this bounded excerpt."),
		});
	} catch (error) {
		entries.push({
			label: localize('diagnostics.logCollectionFailed', "Log collection failed"),
			value: formatConnectionDiagnosticError(getConnectionDiagnosticError(error)),
		});
	}
	return {
		title: localize('diagnostics.windowLogs', "Connection-related Window log excerpt"),
		collapsed: true,
		description: localize('diagnostics.logScope', "Up to 200 lifecycle lines from the last 128 KiB of the current Window log; no rotated or remote logs. Messages may be unavailable at the current log level. Known credentials are redacted; review before sharing."),
		entries,
	};
}
