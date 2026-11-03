/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

export const ILogService = createServiceIdentifier<ILogService>('ILogService');

/**
 * Log levels (taken from vscode.d.ts)
 */
export enum LogLevel {

	/**
	 * No messages are logged with this level.
	 */
	Off = 0,

	/**
	 * All messages are logged with this level.
	 */
	Trace = 1,

	/**
	 * Messages with debug and higher log level are logged with this level.
	 */
	Debug = 2,

	/**
	 * Messages with info and higher log level are logged with this level.
	 */
	Info = 3,

	/**
	 * Messages with warning and higher log level are logged with this level.
	 */
	Warning = 4,

	/**
	 * Only error messages are logged with this level.
	 */
	Error = 5
}

export interface ILogTarget {
	logIt(level: LogLevel, metadataStr: string, ...extra: any[]): void;
	show?(preserveFocus?: boolean): void;
}

/**
 * Utility functions for creating ILogTarget instances.
 */
export namespace LogTarget {
	/**
	 * Creates an ILogTarget from a simple callback function.
	 *
	 * @example
	 * logger.withExtraTarget(LogTarget.fromCallback((level, msg) => {
	 *     console.log(`[${LogLevel[level]}] ${msg}`);
	 * }));
	 */
	export function fromCallback(fn: (level: LogLevel, message: string) => void): ILogTarget {
		return { logIt: fn };
	}
}

// Simple implementation of a log targe used for logging to the console.
export class ConsoleLog implements ILogTarget {
	constructor(private readonly prefix?: string, private readonly minLogLevel: LogLevel = LogLevel.Warning) { }

	logIt(level: LogLevel, metadataStr: string, ...extra: any[]) {
		if (this.prefix) {
			metadataStr = `${this.prefix}${metadataStr}`;
		}

		// Note we don't log INFO or DEBUG messages into console.
		// They are still logged in the output channel.
		if (level === LogLevel.Error) {
			console.error(metadataStr, ...extra);
		} else if (level === LogLevel.Warning) {
			console.warn(metadataStr, ...extra);
		} else if (level >= this.minLogLevel) {
			console.log(metadataStr, ...extra);
		}
	}
}

export interface ILogService extends ILogger {
	readonly _serviceBrand: undefined;
}

/**
 * Mirrors vscode's {@link LogOutputChannel} in terms of available logging functions
 * Args has been ommitted for now in favor of simplifying the interface
 */
export interface ILogger {
	trace(message: string): void;
	debug(message: string): void;
	info(message: string): void;
	warn(message: string): void;
	/**
	 * Logs an error message. Prefer this method over `error()` when logging exception details.
	 *
	 * @param error The Error object that was thrown
	 * @param message An optional message for context (e.g. "Request error"). Must not contain customer data. **Do not include stack trace or messages from the error object.**
	*/
	error(error: string | Error, message?: string): void;
	show(preserveFocus?: boolean): void;

	/**
	 * Creates a sub-logger with a topic prefix. All messages logged through
	 * the sub-logger will be prefixed with the topic, e.g., `[Topic] message`.
	 *
	 * Sub-loggers can be nested, and the prefixes will accumulate,
	 * e.g., `[Parent][Child] message`.
	 *
	 * Sub-loggers inherit extra targets from their parent.
	 *
	 * @param topic The topic name or array of topic names to prefix messages with
	 */
	createSubLogger(topic: string | readonly string[]): ILogger;

	/**
	 * Returns a new logger that also logs to the specified extra target.
	 * The original logger is unchanged (immutable).
	 *
	 * Can be chained to add multiple targets. Sub-loggers created from this
	 * logger will inherit all extra targets.
	 *
	 * Errors thrown by extra targets are silently caught.
	 *
	 * @param target An ILogTarget instance
	 * @returns A new ILogger with the extra target attached
	 *
	 * @example
	 * const logger = logService
	 *     .createSubLogger('MyFeature')
	 *     .withExtraTarget(LogTarget.fromCallback((level, msg) => {
	 *         logContext.trace(msg);
	 *     }));
	 */
	withExtraTarget(target: ILogTarget): ILogger;
}

export class LogServiceImpl extends Disposable implements ILogService {
	declare _serviceBrand: undefined;

	readonly logger: LoggerImpl;

	constructor(
		logTargets: ILogTarget[],
	) {
		super();
		this.logger = new LoggerImpl(logTargets);
	}

	// Delegate logging methods directly to the internal logger
	trace(message: string): void {
		this.logger.trace(message);
	}

	debug(message: string): void {
		this.logger.debug(message);
	}

	info(message: string): void {
		this.logger.info(message);
	}

	warn(message: string): void {
		this.logger.warn(message);
	}

	error(error: string | Error, message?: string): void {
		this.logger.error(error, message);
	}

	show(preserveFocus?: boolean): void {
		this.logger.show(preserveFocus);
	}

	createSubLogger(topic: string | readonly string[]): ILogger {
		return this.logger.createSubLogger(topic);
	}

	withExtraTarget(target: ILogTarget): ILogger {
		return this.logger.withExtraTarget(target);
	}
}

class LoggerImpl implements ILogger {
	constructor(
		private readonly _logTargets: ILogTarget[],
	) { }

	private _logIt(level: LogLevel, message: string): void {
		LogMemory.addLog(LogLevel[level], message);
		this._logTargets.forEach(t => t.logIt(level, message));
	}

	trace(message: string): void {
		this._logIt(LogLevel.Trace, message);
	}

	debug(message: string): void {
		this._logIt(LogLevel.Debug, message);
	}

	info(message: string): void {
		this._logIt(LogLevel.Info, message);
	}

	warn(message: string): void {
		this._logIt(LogLevel.Warning, message);
	}

	error(error: string | Error, message?: string): void {
		this._logIt(LogLevel.Error, collectErrorMessages(error) + (message ? `: ${message}` : ''));
	}

	show(preserveFocus?: boolean): void {
		this._logTargets.forEach(t => t.show?.(preserveFocus));
	}

	createSubLogger(topic: string | readonly string[]): ILogger {
		return new SubLogger(this, topic);
	}

	withExtraTarget(target: ILogTarget): ILogger {
		return new LoggerWithExtraTargets(this, [target]);
	}
}

class SubLogger implements ILogger {
	private readonly _prefix: string;

	constructor(
		private readonly _parent: ILogger,
		topic: string | readonly string[],
		existingPrefix?: string,
	) {
		const topics = Array.isArray(topic) ? topic : [topic];
		const newPrefix = topics.map(t => `[${t}]`).join('');
		this._prefix = existingPrefix ? existingPrefix + newPrefix : newPrefix;
	}

	private _prefixMessage(message: string): string {
		return `${this._prefix} ${message}`;
	}

	trace(message: string): void {
		this._parent.trace(this._prefixMessage(message));
	}

	debug(message: string): void {
		this._parent.debug(this._prefixMessage(message));
	}

	info(message: string): void {
		this._parent.info(this._prefixMessage(message));
	}

	warn(message: string): void {
		this._parent.warn(this._prefixMessage(message));
	}

	error(error: string | Error, message?: string): void {
		const prefixedMessage = message ? this._prefixMessage(message) : this._prefix;
		this._parent.error(error, prefixedMessage);
	}

	show(preserveFocus?: boolean): void {
		this._parent.show(preserveFocus);
	}

	createSubLogger(topic: string | readonly string[]): ILogger {
		return new SubLogger(this._parent, topic, this._prefix);
	}

	withExtraTarget(target: ILogTarget): ILogger {
		return new LoggerWithExtraTargets(this, [target], this._prefix);
	}
}

class LoggerWithExtraTargets implements ILogger {
	constructor(
		private readonly _parent: ILogger,
		private readonly _extraTargets: readonly ILogTarget[],
		private readonly _prefix: string = '',
	) { }

	private _notifyExtraTargets(level: LogLevel, message: string): void {
		const prefixedMessage = this._prefix ? `${this._prefix} ${message}` : message;
		for (const target of this._extraTargets) {
			try {
				target.logIt(level, prefixedMessage);
			} catch {
				// Silent catch - extra targets must not affect primary logging
			}
		}
	}

	trace(message: string): void {
		this._notifyExtraTargets(LogLevel.Trace, message);
		this._parent.trace(message);
	}

	debug(message: string): void {
		this._notifyExtraTargets(LogLevel.Debug, message);
		this._parent.debug(message);
	}

	info(message: string): void {
		this._notifyExtraTargets(LogLevel.Info, message);
		this._parent.info(message);
	}

	warn(message: string): void {
		this._notifyExtraTargets(LogLevel.Warning, message);
		this._parent.warn(message);
	}

	error(error: string | Error, message?: string): void {
		// For extra targets, format a simple message
		const errorStr = typeof error === 'string' ? error : (error.message || 'Error');
		const fullMessage = message ? `${errorStr}: ${message}` : errorStr;
		this._notifyExtraTargets(LogLevel.Error, fullMessage);
		this._parent.error(error, message);
	}

	show(preserveFocus?: boolean): void {
		this._parent.show(preserveFocus);
		for (const target of this._extraTargets) {
			try {
				target.show?.(preserveFocus);
			} catch {
				// Silent catch
			}
		}
	}

	createSubLogger(topic: string | readonly string[]): ILogger {
		// Sub-logger inherits extra targets with updated prefix
		const topics = Array.isArray(topic) ? topic : [topic];
		const newPrefix = this._prefix + topics.map(t => `[${t}]`).join('');
		return new LoggerWithExtraTargets(
			this._parent.createSubLogger(topic),
			this._extraTargets,
			newPrefix
		);
	}

	withExtraTarget(target: ILogTarget): ILogger {
		return new LoggerWithExtraTargets(
			this._parent,
			[...this._extraTargets, target],
			this._prefix
		);
	}
}

export function collectErrorMessages(e: any): string {
	// Collect error messages from nested errors as seen with Node's `fetch`.
	const seen = new Set<any>();
	function collect(e: any, indent: string): string {
		if (!e || !['object', 'string'].includes(typeof e) || seen.has(e)) {
			return '';
		}
		seen.add(e);
		const message = typeof e === 'string' ? e : (e.stack || e.message || e.code || '');
		const messageStr = message.toString?.() as (string | undefined) || '';
		return [
			messageStr ? `${messageStr.split('\n').map(line => `${indent}${line}`).join('\n')}\n` : '',
			e.chromiumDetails ? `${indent}${JSON.stringify(extractChromiumDetails(e.chromiumDetails))}\n` : '',
			collect(e.cause, indent + '  '),
			...(Array.isArray(e.errors) ? e.errors.map((e: any) => collect(e, indent + '  ')) : []),
		].join('');
	}
	return collect(e, '')
		.trim();
}

export function collectSingleLineErrorMessage(e: any, includeDetails = false): string {
	// Collect error messages from nested errors as seen with Node's `fetch`.
	const seen = new Set<any>();
	function collect(e: any): string {
		if (!e || !['object', 'string'].includes(typeof e) || seen.has(e)) {
			return '';
		}
		seen.add(e);
		const message = typeof e === 'string' ? e : (e.message || e.code || '');
		const messageStr = message.toString?.() as (string | undefined) || '';
		const messageLine = messageStr.trim().split('\n').join(' ');
		const details = [
			...(includeDetails && e.chromiumDetails ? [JSON.stringify(extractChromiumDetails(e.chromiumDetails))] : []),
			...(e.cause ? [collect(e.cause)] : []),
			...(Array.isArray(e.errors) ? e.errors.map((e: any) => collect(e)) : []),
		].join(', ');
		return details ? `${messageLine}: ${details}` : messageLine;
	}
	return collect(e);
}

/**
 * Sanitizes a network error message for telemetry by replacing hostnames,
 * IP addresses, and credentials with placeholders.
 */
export function sanitizeNetworkErrorForTelemetry(message: string): string {
	// Strip credentials and host from proxy result strings (e.g., "PROXY user:pass@host" → "PROXY <credentials>@<host>")
	message = message.replace(/(\b(?:PROXY|HTTPS?|SOCKS[45]?)\s+)[^\s]+@([^\s:\/]+)/gi, '$1<credentials>@<host>');
	// Strip host from proxy result strings without credentials (e.g., "PROXY host:8080" → "PROXY <host>:8080")
	message = message.replace(/(\b(?:PROXY|HTTPS?|SOCKS[45]?)\s+)([a-zA-Z0-9][-a-zA-Z0-9.]*)/gi, '$1<host>');
	// Strip credentials and host from URLs (e.g., "://user:pass@host" → "://<credentials>@<host>")
	message = message.replace(/(\/\/)[^\s/]+@([^\s:\/]+)/g, '$1<credentials>@<host>');
	// Replace IPv4 addresses, preserving the port if present
	message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<ip>');
	// Replace IPv6 addresses (full form, e.g., "2001:db8:85a3:0:0:8a2e:370:7334")
	message = message.replace(/(?<![a-zA-Z_:])(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?![a-zA-Z_])/g, '<ip>');
	// Replace IPv6 addresses (compressed form with ::, e.g., "2001:db8::1" or "::1")
	message = message.replace(/(?<![a-zA-Z_:])(?:(?:[0-9a-fA-F]{1,4}:){1,7}|:):[0-9a-fA-F:]*[0-9a-fA-F](?![a-zA-Z_])/g, '<ip>');
	// Replace FQDNs (at least one dot, TLD of 2+ alpha chars), preserving the port if present
	message = message.replace(/\b([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]{2,}\b/g, '<host>');
	return message;
}

/**
 * Chromium error details attached by Electron to fetch errors.
 * Electron's network service process runs separately; when it crashes,
 * `network_process_crashed` is set to `true` on the error's `chromiumDetails`.
 */
export interface ElectronFetchErrorChromiumDetails {
	readonly is_request_error?: boolean;
	readonly network_process_crashed?: boolean;
	readonly session_state?: any;
	readonly drain_error?: any;
	readonly drain_description?: any;
	readonly go_away_error?: any;
	readonly go_away_error_details?: any;
	readonly go_away_debug_data?: any;
	readonly rst_stream_error?: any;
	readonly rst_stream_error_details?: any;
	readonly rst_stream_description?: any;
	readonly last_framer_error?: any;
	readonly last_framer_error_details?: any;
	readonly error_source?: any;
	readonly aliases?: any;
	readonly proxy?: any;
	readonly in_flight_write?: any;
	readonly buffered_spdy_framer?: any;
	readonly tls_info?: any;
	readonly socket_info?: any;
	readonly url_loader_error?: any;
	readonly active_stream_details?: any;
	readonly closed_stream_details?: any;
}

function extractChromiumDetails(details: ElectronFetchErrorChromiumDetails): any {
	if (!details || typeof details !== 'object') {
		return {};
	}

	if (details.is_request_error !== undefined && details.session_state === undefined) {
		return {
			is_request_error: details.is_request_error,
			network_process_crashed: details.network_process_crashed,
		};
	}

	const extracted: any = {
		drain_error: details.drain_error,
		drain_description: details.drain_description,
		go_away_error: details.go_away_error,
		go_away_error_details: details.go_away_error_details,
		go_away_debug_data: details.go_away_debug_data,
		rst_stream_error: details.rst_stream_error,
		rst_stream_error_details: details.rst_stream_error_details,
		rst_stream_description: details.rst_stream_description,
		last_framer_error: details.last_framer_error,
		last_framer_error_details: details.last_framer_error_details,
		error_source: details.error_source,
		aliases_length: Array.isArray(details.aliases) ? details.aliases.length : undefined,
	};

	if (details.proxy) {
		const proxyString = String(details.proxy);
		const proxySchemes = [...proxyString.matchAll(/([a-z][a-z0-9+.-]*):\/\//gi)].map(match => match[1]);
		if (proxySchemes.length > 0) {
			extracted.proxy_schemes = proxySchemes;
		}
	}

	if (details.in_flight_write && typeof details.in_flight_write === 'object') {
		extracted.in_flight_write = {
			frame_type: details.in_flight_write.frame_type,
			frame_size: details.in_flight_write.frame_size,
			remaining_size: details.in_flight_write.remaining_size,
		};
	}

	if (details.buffered_spdy_framer && typeof details.buffered_spdy_framer === 'object') {
		extracted.buffered_spdy_framer = {
			frames_received: details.buffered_spdy_framer.frames_received,
			has_error: details.buffered_spdy_framer.has_error,
			message_fully_read: details.buffered_spdy_framer.message_fully_read,
		};
	}

	if (details.session_state && typeof details.session_state === 'object') {
		const state = details.session_state;
		extracted.session_state = {
			availability_state: state.availability_state,
			session_send_window: state.session_send_window,
			session_recv_window: state.session_recv_window,
			stream_initial_send_window: state.stream_initial_send_window,
			stream_initial_recv_window: state.stream_initial_recv_window,
			send_stalled_by_session_window: state.send_stalled_by_session_window,
			active_stream_count: state.active_stream_count,
			created_stream_count: state.created_stream_count,
			max_concurrent_streams: state.max_concurrent_streams,
			highest_stream_id_sent: state.highest_stream_id_sent,
			frames_sent: state.frames_sent,
			frames_received: state.frames_received,
			ping_in_flight: state.ping_in_flight,
			last_ping_sent_ms: state.last_ping_sent_ms,
			next_ping_id: state.next_ping_id,
			failed_ping_count: state.failed_ping_count,
			support_websocket: state.support_websocket,
			deprecate_http2_priorities: state.deprecate_http2_priorities,
			streams_initiated_count: state.streams_initiated_count,
			streams_abandoned_count: state.streams_abandoned_count,
			read_state: state.read_state,
			write_state: state.write_state,
			pending_create_stream_request_count: state.pending_create_stream_request_count,
			error: state.error,
			error_on_unavailable: state.error_on_unavailable,
			unacked_recv_window_bytes: state.unacked_recv_window_bytes,
			last_good_stream_id: state.last_good_stream_id,
			debug_stream_id: state.debug_stream_id,
			has_ping_based_connection_checking: state.has_ping_based_connection_checking,
			num_broken_connection_detection_requests: state.num_broken_connection_detection_requests,
			session_max_queued_capped_frames: state.session_max_queued_capped_frames,
			num_queued_capped_frames: state.num_queued_capped_frames,
			check_ping_status_pending: state.check_ping_status_pending,
			in_confirm_handshake: state.in_confirm_handshake,
			http2_end_stream_with_data_frame: state.http2_end_stream_with_data_frame,
			reused: state.reused,
			session_max_recv_window_size: state.session_max_recv_window_size,
			max_header_table_size: state.max_header_table_size,
			time_since_last_read_ms: state.time_since_last_read_ms,
			time_since_last_write_ms: state.time_since_last_write_ms,
			time_since_last_recv_window_update_ms: state.time_since_last_recv_window_update_ms,
		};
	}

	if (details.tls_info && typeof details.tls_info === 'object') {
		const tls = details.tls_info;
		extracted.tls_info = {
			is_secure_connection: tls.is_secure_connection,
			ssl_version: tls.ssl_version,
			cipher_suite: tls.cipher_suite,
			negotiated_alpn: tls.negotiated_alpn,
			cert_status: tls.cert_status,
			is_issued_by_known_root: tls.is_issued_by_known_root,
			handshake_type: tls.handshake_type,
			client_cert_sent: tls.client_cert_sent,
			exchange_group: tls.key_exchange_group,
			ct_compliance: tls.ct_compliance,
			alps_negotiated: tls.alps_negotiated,
		};
	}

	if (details.socket_info && typeof details.socket_info === 'object') {
		const socket = details.socket_info;
		extracted.socket_info = {
			is_connected: socket.is_connected,
			was_ever_used: socket.was_ever_used,
			dns_lookup_duration_ms: socket.dns_lookup_duration_ms,
			tcp_connect_duration_ms: socket.tcp_connect_duration_ms,
			ssl_handshake_duration_ms: socket.ssl_handshake_duration_ms,
			owned_socket: socket.owned_socket,
			socket_reuse_type: socket.socket_reuse_type,
		};
	}

	if (details.url_loader_error && typeof details.url_loader_error === 'object') {
		extracted.url_loader_error = {
			is_request_error: details.url_loader_error.is_request_error,
			network_process_crashed: details.url_loader_error.network_process_crashed,
		};
	}

	if (Array.isArray(details.active_stream_details)) {
		extracted.active_stream_details = details.active_stream_details.map((stream: any) => ({
			stream_id: stream.stream_id,
			io_state: stream.io_state,
			type: stream.type,
			priority: stream.priority,
			send_window_size: stream.send_window_size,
			recv_window_size: stream.recv_window_size,
			max_recv_window_size: stream.max_recv_window_size,
			unacked_recv_window_bytes: stream.unacked_recv_window_bytes,
			send_stalled_by_flow_control: stream.send_stalled_by_flow_control,
			raw_sent_bytes: stream.raw_sent_bytes,
			raw_received_bytes: stream.raw_received_bytes,
			recv_bytes: stream.recv_bytes,
			pending_send_status: stream.pending_send_status,
			response_state: stream.response_state,
			pending_send_data_remaining: stream.pending_send_data_remaining,
			request_time_ms: stream.request_time_ms,
			response_time_ms: stream.response_time_ms,
		}));
	}

	if (Array.isArray(details.closed_stream_details)) {
		extracted.closed_stream_details = details.closed_stream_details.map((stream: any) => ({
			stream_id: stream.stream_id,
			io_state: stream.io_state,
			type: stream.type,
			priority: stream.priority,
			send_window_size: stream.send_window_size,
			recv_window_size: stream.recv_window_size,
			max_recv_window_size: stream.max_recv_window_size,
			unacked_recv_window_bytes: stream.unacked_recv_window_bytes,
			send_stalled_by_flow_control: stream.send_stalled_by_flow_control,
			raw_sent_bytes: stream.raw_sent_bytes,
			raw_received_bytes: stream.raw_received_bytes,
			recv_bytes: stream.recv_bytes,
			pending_send_status: stream.pending_send_status,
			response_state: stream.response_state,
			pending_send_data_remaining: stream.pending_send_data_remaining,
			request_time_ms: stream.request_time_ms,
			response_time_ms: stream.response_time_ms,
		}));
	}

	return extracted;
}

export class LogMemory {
	private static _logs: string[] = [];
	private static _requestIds: string[] = [];
	private static readonly MAX_LOGS = 50;

	/**
	 * Extracts the requestId from a log message if it matches the expected pattern.
	 * Returns a string in the format 'requestId: {string}' or undefined if not found.
	 */
	private static extractRequestIdFromMessage(message: string): string | undefined {
		const match = message.match(/request done: requestId: \[([0-9a-fA-F-]+)\] model deployment ID: \[/);
		if (match) {
			const requestId = match[1];
			if (!this._requestIds.includes(requestId)) {
				return requestId;
			}
		}
		return undefined;
	}

	static addLog(level: string, message: string): void {
		if (this._logs.length >= this.MAX_LOGS) {
			this._logs.shift();
		}
		this._logs.push(`${level}: ${message}`);

		// Extract and store requestId if present
		if (this._requestIds.length >= this.MAX_LOGS) {
			this._requestIds.shift();
		}
		const requestId = this.extractRequestIdFromMessage(message);
		if (requestId) {
			this._requestIds.push(requestId);
		}
	}

	static getLogs(): string[] {
		return this._logs;
	}

	static getRequestIds(): string[] {
		return this._requestIds;
	}
}
