/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { formatConnectionDiagnosticError, getConnectionDiagnosticError, sanitizeConnectionDiagnosticText } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IConnectionDiagnosticsSection } from './connectionDiagnostics.js';

const MAX_LOG_BYTES = 128 * 1024;
const MAX_LOG_LINES = 200;
const MAX_OUTPUT_LINES = 20;
const timestampLength = '2026-01-01 00:00:00.000'.length;
const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} /;

/**
 * Keeps only the latest of identical messages, such as those of automatic reconnection attempts,
 * noting how often and since when each was logged, so that one retrying host doesn't push out the others.
 */
function collapseRepeatedMessages(entries: readonly (readonly string[])[]): readonly (readonly string[])[] {
	const latest = new Map<string, { index: number; count: number; first: string }>();
	entries.forEach((entry, index) => {
		const key = [entry[0].slice(timestampLength), ...entry.slice(1)].join('\n');
		const earlier = latest.get(key);
		latest.set(key, { index, count: (earlier?.count ?? 0) + 1, first: earlier?.first ?? entry[0].slice(0, timestampLength) });
	});
	return [...latest.values()].sort((a, b) => a.index - b.index).map(({ index, count, first }) => {
		const [message, ...output] = entries[index];
		return count > 1 ? [localize('diagnostics.repeatedLogMessage', "{0} (logged {1} times since {2})", message, count, first), ...output] : entries[index];
	});
}

/** Only lifecycle messages are exported; protocol payloads, auth dumps and multiline continuations are excluded. */
export function selectConnectionLogLines(text: string): readonly string[] {
	const lifecycle = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[(?:trace|debug|info|warning|error|critical)\] \[(?:RemoteAgentHost|RemoteAgentHostProtocol|BrowserTunnelAgentHost|WebTunnelAgentHost|TunnelAgentHost)\] (?:Connecting|Connected|Reconnecting|Reconnected|Re-establishing|Re-established|Connection closed|Transport lost|Reconnect attempt failed|Automatic reconnect|Scheduling reconnect|Stopped reconnecting|Not reconnecting|Liveness:|Failed to (?:list|enumerate|create a connection|connect|get)|Discovery (?:complete|failed)|Silent status check|Tunnel transport closed|Found \d+ tunnel)/;
	const lines = text.split(/\r?\n/).filter(line => lifecycle.test(line)).map(line => [sanitizeConnectionDiagnosticText(line)]);
	return collapseRepeatedMessages(lines).slice(-MAX_LOG_LINES).map(([line]) => line);
}

/**
 * The SSH, WSL, tunnel and Dev Container services in the shared process only log connection setup,
 * so all of their messages are kept, each with the output that follows a warning or error, but not stack traces.
 */
export function selectSharedProcessLogEntries(text: string): readonly (readonly string[])[] {
	const message = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[(?<level>trace|debug|info|warning|error|critical)\] \[(?:SSHRemoteAgentHost|WSLRemoteAgentHost|TunnelAgentHost|DevContainerAgentHost)\] /;
	// Commands may come from user settings, which can contain credentials.
	const command = /^(?<message>.*\] (?:Starting remote agent host|Using custom agent host command|Spawning dedicated standalone agent host|Opening agent relay channel|bootstrap script): ).*/;
	const entries: string[][] = [];
	let output: string[] | undefined;
	for (const line of text.split(/\r?\n/)) {
		const level = message.exec(line)?.groups?.level;
		if (level) {
			const entry = [line.replace(command, '$<message>[redacted command]')];
			entries.push(entry);
			output = level === 'warning' || level === 'error' || level === 'critical' ? entry : undefined;
		} else if (timestamp.test(line)) {
			output = undefined;
		} else if (output && output.length <= MAX_OUTPUT_LINES && line.trim() && !/^\s+at\s/.test(line)) {
			output.push(line);
		}
	}
	return collapseRepeatedMessages(entries.map(entry => entry.map(line => sanitizeConnectionDiagnosticText(line)))).slice(-MAX_LOG_LINES);
}

/** Replaces the user's home folder with `~`, matching either path separator. */
function redactUserHome(userHome: string | undefined): (line: string) => string {
	const segments = userHome?.replace(/[\\/]+$/, '').split(/[\\/]/);
	// A root folder as home would turn every absolute path into `~`.
	if (!segments || segments.length < 2 || segments.join('').length < 3) {
		return line => line;
	}
	const pattern = new RegExp(`${segments.map(escapeRegExpCharacters).join('[\\\\/]')}(?![\\w.-])`, 'gi');
	return line => line.replace(pattern, '~');
}

async function readLogTail(fileService: IFileService, file: URI): Promise<string> {
	const stat = await fileService.stat(file);
	const position = Math.max(0, stat.size - MAX_LOG_BYTES);
	const result = await fileService.readFile(file, { position, length: MAX_LOG_BYTES });
	const text = result.value.toString();
	if (position === 0) {
		return text;
	}
	// The bounded tail may start mid-line or mid-codepoint.
	const newline = text.indexOf('\n');
	return newline === -1 ? '' : text.slice(newline + 1);
}

export interface IConnectionLogFiles {
	readonly window: URI;
	/** The log of the shared process, which runs the SSH, WSL, tunnel and Dev Container services on desktop for all windows. */
	readonly shared?: URI;
}

/** Merges the connection lines of the given logs by time, tagging each with the log it comes from. */
export async function collectConnectionLogs(fileService: IFileService, files: IConnectionLogFiles, userHome?: string): Promise<IConnectionDiagnosticsSection> {
	const entries = [{ label: localize('diagnostics.logsCaptured', "Collection started at"), value: new Date().toISOString() }];
	const failures: { label: string; value: string }[] = [];
	const messages: { readonly time: string; readonly lines: readonly string[] }[] = [];
	let read = false;
	const collect = async (file: URI, log: string, failure: string, select: (text: string) => readonly (readonly string[])[]) => {
		try {
			for (const [first, ...output] of select(await readLogTail(fileService, file))) {
				messages.push({ time: first.slice(0, timestampLength), lines: [`[${log}] ${first}`, ...output] });
			}
			read = true;
		} catch (error) {
			failures.push({ label: failure, value: formatConnectionDiagnosticError(getConnectionDiagnosticError(error)) });
		}
	};
	await collect(files.window, localize('diagnostics.windowLogName', "Window"), localize('diagnostics.windowLogFailed', "Window log collection failed"),
		text => selectConnectionLogLines(text).map(line => [line]));
	if (files.shared) {
		await collect(files.shared, localize('diagnostics.sharedLogName', "Shared"), localize('diagnostics.sharedLogFailed', "Shared log collection failed"),
			selectSharedProcessLogEntries);
	}
	if (read) {
		// Both logs use the same local timestamp format, so the lines sort by time as text; the sort is stable.
		messages.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
		const redact = redactUserHome(userHome);
		entries.push({
			label: localize('diagnostics.logMessages', "Messages"),
			value: messages.length
				? messages.flatMap(message => message.lines).map(redact).join('\n')
				: localize('diagnostics.noConnectionLogLines', "No connection lines were found in these log excerpts."),
		});
	}
	entries.push(...failures);
	return {
		title: localize('diagnostics.connectionLogs', "Connection log excerpt"),
		collapsed: true,
		description: files.shared
			? localize('diagnostics.connectionLogScope', "Up to 200 messages each from the last 128 KiB of this window's Window log and of the Shared log, which all windows write to, sorted by time and tagged with their log. Repeated messages appear once, at their latest time. Output after Shared log warnings and errors is included; stack traces, rotated logs, and logs on remote computers are not. Messages may be unavailable at the current log level. Known credentials and your home folder are redacted; review before sharing.")
			: localize('diagnostics.windowLogScope', "Up to 200 lifecycle messages from the last 128 KiB of this window's Window log; no rotated or remote logs. Repeated messages appear once, at their latest time. Messages may be unavailable at the current log level. Known credentials are redacted; review before sharing."),
		entries,
	};
}
