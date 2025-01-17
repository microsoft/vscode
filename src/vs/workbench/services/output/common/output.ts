/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from '../../../../base/common/event.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { LogLevel } from '../../../../platform/log/common/log.js';
import { Range } from '../../../../editor/common/core/range.js';

/**
 * Mime type used by the output editor.
 */
export const OUTPUT_MIME = 'text/x-code-output';

/**
 * Id used by the output editor.
 */
export const OUTPUT_MODE_ID = 'Log';

/**
 * Mime type used by the log output editor.
 */
export const LOG_MIME = 'text/x-code-log-output';

/**
 * Id used by the log output editor.
 */
export const LOG_MODE_ID = 'log';

/**
 * Output view id
 */
export const OUTPUT_VIEW_ID = 'workbench.panel.output';

export const CONTEXT_IN_OUTPUT = new RawContextKey<boolean>('inOutput', false);
export const CONTEXT_ACTIVE_FILE_OUTPUT = new RawContextKey<boolean>('activeLogOutput', false);
export const CONTEXT_ACTIVE_LOG_FILE_OUTPUT = new RawContextKey<boolean>('activeLogOutput.isLog', false);
export const CONTEXT_ACTIVE_OUTPUT_LEVEL_SETTABLE = new RawContextKey<boolean>('activeLogOutput.levelSettable', false);
export const CONTEXT_ACTIVE_OUTPUT_LEVEL = new RawContextKey<string>('activeLogOutput.level', '');
export const CONTEXT_ACTIVE_OUTPUT_LEVEL_IS_DEFAULT = new RawContextKey<boolean>('activeLogOutput.levelIsDefault', false);
export const CONTEXT_OUTPUT_SCROLL_LOCK = new RawContextKey<boolean>(`outputView.scrollLock`, false);
export const ACTIVE_OUTPUT_CHANNEL_CONTEXT = new RawContextKey<string>('activeOutputChannel', '');
export const SHOW_TRACE_FILTER_CONTEXT = new RawContextKey<boolean>('output.filter.trace', true);
export const SHOW_DEBUG_FILTER_CONTEXT = new RawContextKey<boolean>('output.filter.debug', true);
export const SHOW_INFO_FILTER_CONTEXT = new RawContextKey<boolean>('output.filter.info', true);
export const SHOW_WARNING_FILTER_CONTEXT = new RawContextKey<boolean>('output.filter.warning', true);
export const SHOW_ERROR_FILTER_CONTEXT = new RawContextKey<boolean>('output.filter.error', true);
export const OUTPUT_FILTER_FOCUS_CONTEXT = new RawContextKey<boolean>('outputFilterFocus', false);
export const HIDE_SOURCE_FILTER_CONTEXT = new RawContextKey<string>('output.filter.sources', '');

export interface IOutputViewFilters {
	readonly onDidChange: Event<void>;
	text: string;
	trace: boolean;
	debug: boolean;
	info: boolean;
	warning: boolean;
	error: boolean;
	sources: string;
	toggleSource(source: string): void;
	hasSource(source: string): boolean;
}

export const IOutputService = createDecorator<IOutputService>('outputService');

/**
 * The output service to manage output from the various processes running.
 */
export interface IOutputService {
	readonly _serviceBrand: undefined;

	/**
	 *  Output view filters.
	 */
	readonly filters: IOutputViewFilters;

	/**
	 * Given the channel id returns the output channel instance.
	 * Channel should be first registered via OutputChannelRegistry.
	 */
	getChannel(id: string): IOutputChannel | undefined;

	/**
	 * Given the channel id returns the registered output channel descriptor.
	 */
	getChannelDescriptor(id: string): IOutputChannelDescriptor | undefined;

	/**
	 * Returns an array of all known output channels descriptors.
	 */
	getChannelDescriptors(): IOutputChannelDescriptor[];

	/**
	 * Returns the currently active channel.
	 * Only one channel can be active at a given moment.
	 */
	getActiveChannel(): IOutputChannel | undefined;

	/**
	 * Show the channel with the passed id.
	 */
	showChannel(id: string, preserveFocus?: boolean): Promise<void>;

	/**
	 * Allows to register on active output channel change.
	 */
	onActiveOutputChannel: Event<string>;

	/**
	 * Register a compound log channel with the given channels.
	 */
	registerCompoundLogChannel(channels: IOutputChannelDescriptor[]): string;

	/**
	 * Save the logs to a file.
	 */
	saveOutputAs(...channels: IOutputChannelDescriptor[]): Promise<void>;
}

export enum OutputChannelUpdateMode {
	Append = 1,
	Replace,
	Clear
}

export interface IOutputChannel {

	/**
	 * Identifier of the output channel.
	 */
	id: string;

	/**
	 * Label of the output channel to be displayed to the user.
	 */
	label: string;

	/**
	 * URI of the output channel.
	 */
	uri: URI;

	/**
	 * Appends output to the channel.
	 */
	append(output: string): void;

	/**
	 * Clears all received output for this channel.
	 */
	clear(): void;

	/**
	 * Replaces the content of the channel with given output
	 */
	replace(output: string): void;

	/**
	 * Update the channel.
	 */
	update(mode: OutputChannelUpdateMode.Append): void;
	update(mode: OutputChannelUpdateMode, till: number): void;

	/**
	 * Disposes the output channel.
	 */
	dispose(): void;
}

export const Extensions = {
	OutputChannels: 'workbench.contributions.outputChannels'
};

export interface IOutputChannelDescriptor {
	id: string;
	label: string;
	log: boolean;
	languageId?: string;
	source?: IOutputContentSource | ReadonlyArray<IOutputContentSource>;
	extensionId?: string;
	user?: boolean;
}

export interface ISingleSourceOutputChannelDescriptor extends IOutputChannelDescriptor {
	source: IOutputContentSource;
}

export interface IMultiSourceOutputChannelDescriptor extends IOutputChannelDescriptor {
	source: ReadonlyArray<IOutputContentSource>;
}

export function isSingleSourceOutputChannelDescriptor(descriptor: IOutputChannelDescriptor): descriptor is ISingleSourceOutputChannelDescriptor {
	return !!descriptor.source && !Array.isArray(descriptor.source);
}

export function isMultiSourceOutputChannelDescriptor(descriptor: IOutputChannelDescriptor): descriptor is IMultiSourceOutputChannelDescriptor {
	return Array.isArray(descriptor.source);
}

export interface IOutputContentSource {
	readonly name?: string;
	readonly resource: URI;
}

export interface IOutputChannelRegistry {

	readonly onDidRegisterChannel: Event<string>;
	readonly onDidRemoveChannel: Event<IOutputChannelDescriptor>;
	readonly onDidUpdateChannelSources: Event<IMultiSourceOutputChannelDescriptor>;

	/**
	 * Make an output channel known to the output world.
	 */
	registerChannel(descriptor: IOutputChannelDescriptor): void;

	/**
	 * Update the files for the given output channel.
	 */
	updateChannelSources(id: string, sources: IOutputContentSource[]): void;

	/**
	 * Returns the list of channels known to the output world.
	 */
	getChannels(): IOutputChannelDescriptor[];

	/**
	 * Returns the channel with the passed id.
	 */
	getChannel(id: string): IOutputChannelDescriptor | undefined;

	/**
	 * Remove the output channel with the passed id.
	 */
	removeChannel(id: string): void;
}

class OutputChannelRegistry implements IOutputChannelRegistry {
	private channels = new Map<string, IOutputChannelDescriptor>();

	private readonly _onDidRegisterChannel = new Emitter<string>();
	readonly onDidRegisterChannel = this._onDidRegisterChannel.event;

	private readonly _onDidRemoveChannel = new Emitter<IOutputChannelDescriptor>();
	readonly onDidRemoveChannel = this._onDidRemoveChannel.event;

	private readonly _onDidUpdateChannelFiles = new Emitter<IMultiSourceOutputChannelDescriptor>();
	readonly onDidUpdateChannelSources = this._onDidUpdateChannelFiles.event;

	public registerChannel(descriptor: IOutputChannelDescriptor): void {
		if (!this.channels.has(descriptor.id)) {
			this.channels.set(descriptor.id, descriptor);
			this._onDidRegisterChannel.fire(descriptor.id);
		}
	}

	public getChannels(): IOutputChannelDescriptor[] {
		const result: IOutputChannelDescriptor[] = [];
		this.channels.forEach(value => result.push(value));
		return result;
	}

	public getChannel(id: string): IOutputChannelDescriptor | undefined {
		return this.channels.get(id);
	}

	public updateChannelSources(id: string, sources: IOutputContentSource[]): void {
		const channel = this.channels.get(id);
		if (channel && isMultiSourceOutputChannelDescriptor(channel)) {
			channel.source = sources;
			this._onDidUpdateChannelFiles.fire(channel);
		}
	}

	public removeChannel(id: string): void {
		const channel = this.channels.get(id);
		if (channel) {
			this.channels.delete(id);
			this._onDidRemoveChannel.fire(channel);
		}
	}
}

Registry.add(Extensions.OutputChannels, new OutputChannelRegistry());

const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s(?:\[((?!info|trace|debug|error|warning).*?)\]\s)?(\[(info|trace|debug|error|warning)\])/;

export interface ILogEntry {
	readonly timestamp: number;
	readonly source?: string;
	readonly logLevel: LogLevel;
	readonly timestampRange: Range;
	readonly range: Range;
}

/**
 * Parses log entries from a given text model starting from a specified line.
 *
 * @param model - The text model containing the log entries.
 * @param fromLine - The line number to start parsing from (default is 1).
 * @returns An array of log entries, each containing the log level and the range of lines it spans.
 */
export function parseLogEntries(model: ITextModel, fromLine: number = 1): ILogEntry[] {
	const logEntries: ILogEntry[] = [];
	for (let lineNumber = fromLine; lineNumber <= model.getLineCount(); lineNumber++) {
		const logEntry = parseLogEntryAt(model, lineNumber);
		if (logEntry) {
			logEntries.push(logEntry);
			lineNumber = logEntry.range.endLineNumber;
		}
	}
	return logEntries;
}


/**
 * Parses a log entry at the specified line number in the given text model.
 *
 * @param model - The text model containing the log entries.
 * @param lineNumber - The line number at which to start parsing the log entry.
 * @returns An object representing the parsed log entry, or `null` if no log entry is found at the specified line.
 *
 * The returned log entry object contains:
 * - `timestamp`: The timestamp of the log entry as a number.
 * - `logLevel`: The log level of the log entry.
 * - `range`: The range of lines that the log entry spans.
 */
export function parseLogEntryAt(model: ITextModel, lineNumber: number): ILogEntry | null {
	const lineContent = model.getLineContent(lineNumber);
	const match = LOG_ENTRY_REGEX.exec(lineContent);
	if (match) {
		const timestamp = new Date(match[1]).getTime();
		const timestampRange = new Range(lineNumber, 1, lineNumber, match[1].length + 1);
		const source = match[2];
		const logLevel = parseLogLevel(match[4]);
		const startLine = lineNumber;
		let endLine = lineNumber;

		while (endLine < model.getLineCount()) {
			const nextLineContent = model.getLineContent(endLine + 1);
			if (model.getLineFirstNonWhitespaceColumn(endLine + 1) === 0 || LOG_ENTRY_REGEX.test(nextLineContent)) {
				break;
			}
			endLine++;
		}
		return { timestamp, logLevel, source, range: new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)), timestampRange };
	}
	return null;
}

/**
 * Iterator for log entries from a model with a processing function.
 *
 * @param model - The text model containing the log entries.
 * @param process - A function to process each log entry.
 * @returns An iterable iterator for processed log entries.
 */
export function* logEntryIterator<T>(model: ITextModel, process: (logEntry: ILogEntry) => T): IterableIterator<T> {
	for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
		const logEntry = parseLogEntryAt(model, lineNumber);
		if (logEntry) {
			yield process(logEntry);
			lineNumber = logEntry.range.endLineNumber;
		}
	}
}

function parseLogLevel(level: string): LogLevel {
	switch (level.toLowerCase()) {
		case 'trace':
			return LogLevel.Trace;
		case 'debug':
			return LogLevel.Debug;
		case 'info':
			return LogLevel.Info;
		case 'warning':
			return LogLevel.Warning;
		case 'error':
			return LogLevel.Error;
		default:
			throw new Error(`Unknown log level: ${level}`);
	}
}
