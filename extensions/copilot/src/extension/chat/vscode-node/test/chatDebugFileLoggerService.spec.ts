/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../../platform/log/common/logService';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../../../platform/otel/common/index';
import { ICompletedSpanData, IOTelService, ISpanEventData, SpanStatusCode } from '../../../../platform/otel/common/otelService';
import { IExperimentationService, NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatDebugFileLoggerService } from '../chatDebugFileLoggerService';

// ── Test helpers ──

function makeSpan(overrides: Partial<ICompletedSpanData> & { attributes?: Record<string, string | number | boolean | string[]> }): ICompletedSpanData {
	return {
		name: 'test-span',
		spanId: 'span-1',
		traceId: 'trace-1',
		startTime: 1000,
		endTime: 2000,
		status: { code: SpanStatusCode.OK },
		attributes: {},
		events: [],
		...overrides,
	};
}

function makeToolCallSpan(sessionId: string, toolName: string): ICompletedSpanData {
	return makeSpan({
		name: toolName,
		attributes: {
			[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
			[GenAiAttr.TOOL_NAME]: toolName,
			[CopilotChatAttr.CHAT_SESSION_ID]: sessionId,
		},
	});
}

function makeChatSpan(sessionId: string, model: string, inputTokens: number, outputTokens: number): ICompletedSpanData {
	return makeSpan({
		name: 'chat',
		attributes: {
			[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
			[GenAiAttr.REQUEST_MODEL]: model,
			[GenAiAttr.USAGE_INPUT_TOKENS]: inputTokens,
			[GenAiAttr.USAGE_OUTPUT_TOKENS]: outputTokens,
			[CopilotChatAttr.CHAT_SESSION_ID]: sessionId,
		},
	});
}

class TestOTelService {
	declare readonly _serviceBrand: undefined;
	readonly config = {} as never;

	private readonly _onDidCompleteSpan = new Emitter<ICompletedSpanData>();
	readonly onDidCompleteSpan = this._onDidCompleteSpan.event;

	private readonly _onDidEmitSpanEvent = new Emitter<ISpanEventData>();
	readonly onDidEmitSpanEvent = this._onDidEmitSpanEvent.event;

	fireSpan(span: ICompletedSpanData): void {
		this._onDidCompleteSpan.fire(span);
	}

	fireSpanEvent(event: ISpanEventData): void {
		this._onDidEmitSpanEvent.fire(event);
	}

	startSpan() { return { setAttribute() { }, setAttributes() { }, setStatus() { }, recordException() { }, addEvent() { }, getSpanContext() { return undefined; }, end() { } }; }
	startActiveSpan<T>(_n: string, _o: unknown, fn: (s: unknown) => Promise<T>) { return fn(this.startSpan()); }
	getActiveTraceContext() { return undefined; }
	storeTraceContext() { }
	getStoredTraceContext() { return undefined; }
	runWithTraceContext<T>(_c: unknown, fn: () => Promise<T>) { return fn(); }
	recordMetric() { }
	incrementCounter() { }
	emitLogRecord() { }
	async flush() { }
	async shutdown() { }

	dispose(): void {
		this._onDidCompleteSpan.dispose();
		this._onDidEmitSpanEvent.dispose();
	}
}

class TestExtensionContext {
	declare readonly _serviceBrand: undefined;
	readonly storageUri: URI;

	constructor(tmpDir: string) {
		this.storageUri = URI.file(tmpDir);
	}
}

class TestFileSystemService {
	declare readonly _serviceBrand: undefined;

	async stat(uri: URI) {
		const stats = await fs.promises.stat(uri.fsPath);
		return { mtime: stats.mtimeMs, ctime: stats.ctimeMs, size: stats.size };
	}

	async readDirectory(uri: URI) {
		const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
		return entries.map(e => [e.name, e.isFile() ? 1 : 2] as [string, number]);
	}

	async createDirectory(uri: URI) {
		await fs.promises.mkdir(uri.fsPath, { recursive: true });
	}

	async delete(uri: URI, options?: { recursive?: boolean }) {
		const stats = await fs.promises.stat(uri.fsPath);
		if (stats.isDirectory() && options?.recursive) {
			await fs.promises.rm(uri.fsPath, { recursive: true, force: true });
		} else {
			await fs.promises.unlink(uri.fsPath);
		}
	}
}

class TestLogService {
	declare readonly _serviceBrand: undefined;
	info() { }
	warn() { }
	error() { }
	debug() { }
	trace() { }
}

class TestConfigurationService {
	declare readonly _serviceBrand: undefined;
	getConfig(key: { defaultValue: unknown }) { return key.defaultValue; }
	getExperimentBasedConfig(key: { defaultValue: unknown }) {
		if (key === ConfigKey.Advanced.ChatDebugFileLogging) {
			return true; // Enable debug logging for tests
		}
		return key.defaultValue;
	}
	onDidChangeConfiguration = Event.None;
}

class TestTelemetryService {
	declare readonly _serviceBrand: undefined;
	sendMSFTTelemetryEvent() { }
}

class TestEnvService {
	declare readonly _serviceBrand: undefined;
	readonly vscodeVersion = '1.99.0-test';
	getVersion() { return '0.0.0-test'; }
}

describe('ChatDebugFileLoggerService', () => {
	let disposables: DisposableStore;
	let tmpDir: string;
	let otelService: TestOTelService;
	let service: ChatDebugFileLoggerService;

	beforeEach(async () => {
		disposables = new DisposableStore();
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chatdebug-'));

		otelService = new TestOTelService();

		service = new ChatDebugFileLoggerService(
			otelService as unknown as IOTelService,
			new TestFileSystemService() as unknown as IFileSystemService,
			new TestExtensionContext(tmpDir) as unknown as IVSCodeExtensionContext,
			new TestLogService() as unknown as ILogService,
			new TestConfigurationService() as unknown as IConfigurationService,
			new NullExperimentationService() as unknown as IExperimentationService,
			new TestTelemetryService() as unknown as ITelemetryService,
			new TestEnvService() as unknown as IEnvService,
		);
		disposables.add(service);
	});

	afterEach(async () => {
		disposables.dispose();
		otelService.dispose();
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	async function readLogEntries(sessionId: string): Promise<Record<string, unknown>[]> {
		const logPath = service.getLogPath(sessionId);
		if (!logPath) { return []; }
		const content = await fs.promises.readFile(logPath.fsPath, 'utf-8');
		return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
	}

	it('writes tool call span for explicitly started session', async () => {
		await service.startSession('session-1');
		const span = makeToolCallSpan('session-1', 'read_file');
		otelService.fireSpan(span);

		expect(service.getActiveSessionIds()).toContain('session-1');
		expect(service.getLogPath('session-1')).toBeDefined();

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe('session_start');
		expect(entries[1].type).toBe('tool_call');
		expect(entries[1].name).toBe('read_file');
		expect(entries[1].sid).toBe('session-1');
		expect(entries[1].status).toBe('ok');
	});

	it('writes LLM request with token counts', async () => {
		await service.startSession('session-1');
		const span = makeChatSpan('session-1', 'gpt-4o', 1000, 500);
		otelService.fireSpan(span);

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		expect(entries).toHaveLength(2);
		expect(entries[1].type).toBe('llm_request');
		expect(entries[1].name).toBe('chat:gpt-4o');
		const attrs = entries[1].attrs as Record<string, unknown>;
		expect(attrs.model).toBe('gpt-4o');
		expect(attrs.inputTokens).toBe(1000);
		expect(attrs.outputTokens).toBe(500);
	});

	it('records error status from failed spans', async () => {
		await service.startSession('session-1');
		const span = makeSpan({
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
				[GenAiAttr.TOOL_NAME]: 'run_in_terminal',
				[CopilotChatAttr.CHAT_SESSION_ID]: 'session-1',
			},
			status: { code: SpanStatusCode.ERROR, message: 'Command failed' },
		});
		otelService.fireSpan(span);

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		expect(entries[1].status).toBe('error');
		expect((entries[1].attrs as Record<string, unknown>).error).toBe('Command failed');
	});

	it('isDebugLogUri returns true for files under debug-logs', () => {
		const debugLogUri = URI.joinPath(URI.file(tmpDir), 'debug-logs', 'session-1', 'main.jsonl');
		expect(service.isDebugLogUri(debugLogUri)).toBe(true);
	});

	it('isDebugLogUri returns false for unrelated URIs', () => {
		const otherUri = URI.file('/some/other/path/file.txt');
		expect(service.isDebugLogUri(otherUri)).toBe(false);
	});

	it('endSession flushes and removes session', async () => {
		await service.startSession('session-1');
		otelService.fireSpan(makeToolCallSpan('session-1', 'read_file'));
		expect(service.getActiveSessionIds()).toContain('session-1');

		await service.endSession('session-1');
		expect(service.getActiveSessionIds()).not.toContain('session-1');

		// File should have been written in directory structure
		const logPath = URI.joinPath(URI.file(tmpDir), 'debug-logs', 'session-1', 'main.jsonl');
		const content = await fs.promises.readFile(logPath.fsPath, 'utf-8');
		expect(content.trim()).not.toBe('');
	});

	it('ignores spans without a session ID', async () => {
		const span = makeSpan({
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
				[GenAiAttr.TOOL_NAME]: 'some_tool',
				// No session ID
			},
		});
		otelService.fireSpan(span);

		expect(service.getActiveSessionIds()).toHaveLength(0);
	});

	it('truncates long attribute values', async () => {
		await service.startSession('session-1');
		const longArgs = 'x'.repeat(6000);
		const span = makeSpan({
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
				[GenAiAttr.TOOL_NAME]: 'read_file',
				[GenAiAttr.TOOL_CALL_ARGUMENTS]: longArgs,
				[CopilotChatAttr.CHAT_SESSION_ID]: 'session-1',
			},
		});
		otelService.fireSpan(span);

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		const args = (entries[1].attrs as Record<string, unknown>).args as string;
		expect(args.length).toBeLessThan(longArgs.length);
		expect(args).toContain('[truncated]');
	});

	it('routes child session spans to parent directory with cross-reference', async () => {
		// First, create a parent session
		otelService.fireSpan(makeToolCallSpan('parent-session', 'read_file'));

		// Fire a child session span (e.g., title generation) with parent info
		const titleSpan = makeChatSpan('title-child-id', 'gpt-4o-mini', 100, 20);
		const titleSpanWithParent: ICompletedSpanData = {
			...titleSpan,
			attributes: {
				...titleSpan.attributes,
				[CopilotChatAttr.PARENT_CHAT_SESSION_ID]: 'parent-session',
				[CopilotChatAttr.DEBUG_LOG_LABEL]: 'title',
			},
		};
		otelService.fireSpan(titleSpanWithParent);

		await service.flush('parent-session');
		await service.flush('title-child-id');

		// Parent's main.jsonl should contain the tool call + a child_session_ref
		const parentEntries = await readLogEntries('parent-session');
		const refEntry = parentEntries.find(e => e.type === 'child_session_ref');
		expect(refEntry).toBeDefined();
		expect((refEntry!.attrs as Record<string, unknown>).childLogFile).toBe('title-title-child-id.jsonl');
		expect((refEntry!.attrs as Record<string, unknown>).label).toBe('title');

		// Child's log file should be under the parent directory
		const childPath = service.getLogPath('title-child-id');
		expect(childPath).toBeDefined();
		expect(childPath!.fsPath).toContain('parent-session');
		expect(childPath!.fsPath).toContain('title-title-child-id.jsonl');

		// Child should have the session_start + LLM request entry
		const childEntries = await readLogEntries('title-child-id');
		expect(childEntries).toHaveLength(2);
		expect(childEntries[0].type).toBe('session_start');
		expect(childEntries[1].type).toBe('llm_request');
	});

	it('restarts flush timer when flushIntervalMs config changes at runtime', async () => {
		let configuredInterval = 4000;
		const configChangeEmitter = new Emitter<{ affectsConfiguration: (key: string) => boolean }>();

		const configService = {
			_serviceBrand: undefined as undefined,
			getConfig: () => configuredInterval,
			getExperimentBasedConfig: () => true,
			onDidChangeConfiguration: configChangeEmitter.event,
		};

		const svc = new ChatDebugFileLoggerService(
			otelService as unknown as IOTelService,
			new TestFileSystemService() as unknown as IFileSystemService,
			new TestExtensionContext(tmpDir) as unknown as IVSCodeExtensionContext,
			new TestLogService() as unknown as ILogService,
			configService as unknown as IConfigurationService,
			new NullExperimentationService() as unknown as IExperimentationService,
			new TestTelemetryService() as unknown as ITelemetryService,
			new TestEnvService() as unknown as IEnvService,
		);
		disposables.add(svc);
		disposables.add(configChangeEmitter);

		// Start a session so the flush timer is running
		const span = makeToolCallSpan('interval-test', 'read_file');
		otelService.fireSpan(span);
		expect(svc.getActiveSessionIds()).toContain('interval-test');

		// Spy on clearInterval/setInterval to verify timer restart
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		const setSpy = vi.spyOn(globalThis, 'setInterval');

		// Change the configured interval and fire the config change event
		configuredInterval = 8000;
		configChangeEmitter.fire({
			affectsConfiguration: key => key === ConfigKey.Advanced.ChatDebugFileLoggingFlushInterval.fullyQualifiedId,
		});

		expect(clearSpy).toHaveBeenCalled();
		expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 8000);

		clearSpy.mockRestore();
		setSpy.mockRestore();
	});

	it('inherits session ID from parent span for child spans without session ID', async () => {
		await service.startSession('session-1');

		// Parent span with session ID
		const parentSpan = makeSpan({
			spanId: 'parent-span-1',
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.AGENT_NAME]: 'copilot',
				[CopilotChatAttr.CHAT_SESSION_ID]: 'session-1',
			},
		});
		otelService.fireSpan(parentSpan);

		// Child span without session ID but with parentSpanId
		const childSpan = makeSpan({
			spanId: 'child-span-1',
			parentSpanId: 'parent-span-1',
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.EXECUTE_TOOL,
				[GenAiAttr.TOOL_NAME]: 'read_file',
				// No CHAT_SESSION_ID — should inherit from parent
			},
		});
		otelService.fireSpan(childSpan);

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		const toolEntry = entries.find(e => e.type === 'tool_call');
		expect(toolEntry).toBeDefined();
		expect(toolEntry!.name).toBe('read_file');
		expect(toolEntry!.sid).toBe('session-1');
	});

	it('inherits session ID from parent span for user_message span events', async () => {
		await service.startSession('session-1');

		// Parent span with session ID
		const parentSpan = makeSpan({
			spanId: 'parent-span-2',
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.AGENT_NAME]: 'copilot',
				[CopilotChatAttr.CHAT_SESSION_ID]: 'session-1',
			},
		});
		otelService.fireSpan(parentSpan);

		// user_message event without session ID but with parentSpanId
		const spanEvent: ISpanEventData = {
			spanId: 'child-event-span',
			traceId: 'trace-1',
			parentSpanId: 'parent-span-2',
			eventName: 'user_message',
			attributes: { content: 'hello world' },
			timestamp: 1500,
		};
		otelService.fireSpanEvent(spanEvent);

		await service.flush('session-1');
		const entries = await readLogEntries('session-1');

		const userMsgEntry = entries.find(e => e.type === 'user_message');
		expect(userMsgEntry).toBeDefined();
		expect(userMsgEntry!.sid).toBe('session-1');
		expect((userMsgEntry!.attrs as Record<string, unknown>).content).toBe('hello world');
	});

	it('writes models.json when model snapshot is set before session starts', async () => {
		const models = [{ id: 'gpt-4o', name: 'GPT-4o', capabilities: { type: 'chat', family: 'gpt-4o' } }];
		service.setModelSnapshot(models);

		await service.startSession('session-models');
		await service.flush('session-models');

		const sessionDir = service.getSessionDir('session-models');
		expect(sessionDir).toBeDefined();
		const modelsPath = path.join(sessionDir!.fsPath, 'models.json');
		const content = await fs.promises.readFile(modelsPath, 'utf-8');
		const parsed = JSON.parse(content);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe('gpt-4o');
	});

	it('writes models.json when model snapshot arrives after session starts', async () => {
		await service.startSession('session-late');
		await service.flush('session-late');

		// Model snapshot arrives after session already started
		const models = [{ id: 'claude-sonnet', name: 'Claude Sonnet' }];
		service.setModelSnapshot(models);
		await service.flush('session-late');

		const sessionDir = service.getSessionDir('session-late');
		expect(sessionDir).toBeDefined();
		const modelsPath = path.join(sessionDir!.fsPath, 'models.json');
		const content = await fs.promises.readFile(modelsPath, 'utf-8');
		const parsed = JSON.parse(content);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe('claude-sonnet');
	});

	it('does not write models.json more than once per session', async () => {
		const models = [{ id: 'gpt-4o', name: 'GPT-4o' }];
		service.setModelSnapshot(models);

		await service.startSession('session-dedup');
		await service.flush('session-dedup');

		const sessionDir = service.getSessionDir('session-dedup');
		const modelsPath = path.join(sessionDir!.fsPath, 'models.json');

		// Overwrite the file with different content to detect if it gets rewritten
		await fs.promises.writeFile(modelsPath, '"sentinel"', 'utf-8');

		// Calling setModelSnapshot again should NOT overwrite for existing sessions
		service.setModelSnapshot([{ id: 'new-model' }]);

		const content = await fs.promises.readFile(modelsPath, 'utf-8');
		expect(content).toBe('"sentinel"');
	});

	it('readEntries returns entries from flushed JSONL and unflushed buffer', async () => {
		await service.startSession('session-read');
		otelService.fireSpan(makeToolCallSpan('session-read', 'tool_a'));
		await service.flush('session-read');

		// Fire another span without flushing — it should be in the buffer
		otelService.fireSpan(makeToolCallSpan('session-read', 'tool_b'));

		const entries = await service.readEntries('session-read');
		const toolEntries = entries.filter(e => e.type === 'tool_call');
		expect(toolEntries.length).toBe(2);
		expect(toolEntries[0].name).toBe('tool_a');
		expect(toolEntries[1].name).toBe('tool_b');
	});

	it('readEntries returns empty array for unknown session', async () => {
		const entries = await service.readEntries('nonexistent-session');
		expect(entries).toEqual([]);
	});

	it('readTailEntries returns last N entries from a flushed session', async () => {
		await service.startSession('session-tail');
		for (let i = 0; i < 5; i++) {
			otelService.fireSpan(makeToolCallSpan('session-tail', `tool_${i}`));
		}
		await service.flush('session-tail');

		const entries = await service.readTailEntries('session-tail', 2);
		const toolEntries = entries.filter(e => e.type === 'tool_call');
		// Should return the last 2 tool entries
		expect(toolEntries.length).toBe(2);
		expect(toolEntries[0].name).toBe('tool_3');
		expect(toolEntries[1].name).toBe('tool_4');
	});

	it('streamEntries calls onEntry for each parsed line', async () => {
		await service.startSession('session-stream');
		otelService.fireSpan(makeToolCallSpan('session-stream', 'tool_x'));
		otelService.fireSpan(makeChatSpan('session-stream', 'gpt-4o', 100, 50));
		await service.flush('session-stream');

		const types: string[] = [];
		await service.streamEntries('session-stream', entry => {
			types.push(entry.type);
		});
		expect(types).toContain('tool_call');
		expect(types).toContain('llm_request');
	});

	it('onDidEmitEntry fires for each buffered entry', async () => {
		await service.startSession('session-emit');
		const emitted: Array<{ sessionId: string; type: string }> = [];
		const sub = service.onDidEmitEntry(({ sessionId, entry }) => {
			emitted.push({ sessionId, type: entry.type });
		});

		otelService.fireSpan(makeToolCallSpan('session-emit', 'tool_y'));

		sub.dispose();

		const toolEvents = emitted.filter(e => e.type === 'tool_call');
		expect(toolEvents.length).toBe(1);
		expect(toolEvents[0].sessionId).toBe('session-emit');
	});

	// ── Subagent / child session tests ──

	it('startChildSession with parentToolSpanId sets parentSpanId on child_session_ref', async () => {
		await service.startSession('parent-1');
		otelService.fireSpan(makeToolCallSpan('parent-1', 'read_file'));

		service.startChildSession('child-1', 'parent-1', 'runSubagent-Explore', 'tool-span-42');

		// Fire a span for the child to trigger _ensureSession → child_session_ref
		const childSpan = makeChatSpan('child-1', 'claude-haiku', 100, 20);
		otelService.fireSpan(childSpan);

		await service.flush('parent-1');
		await service.flush('child-1');

		const parentEntries = await readLogEntries('parent-1');
		const ref = parentEntries.find(e => e.type === 'child_session_ref');
		expect(ref).toBeDefined();
		expect(ref!.parentSpanId).toBe('tool-span-42');
		expect((ref!.attrs as Record<string, unknown>).label).toBe('runSubagent-Explore');
		expect((ref!.attrs as Record<string, unknown>).childSessionId).toBe('child-1');
	});

	it('startChildSession without parentToolSpanId omits parentSpanId', async () => {
		await service.startSession('parent-2');
		otelService.fireSpan(makeToolCallSpan('parent-2', 'read_file'));

		service.startChildSession('child-2', 'parent-2', 'title');

		const childSpan = makeChatSpan('child-2', 'gpt-4o-mini', 50, 10);
		otelService.fireSpan(childSpan);

		await service.flush('parent-2');
		await service.flush('child-2');

		const parentEntries = await readLogEntries('parent-2');
		const ref = parentEntries.find(e => e.type === 'child_session_ref');
		expect(ref).toBeDefined();
		expect(ref!.parentSpanId).toBeUndefined();
	});

	it('child session JSONL is written under parent directory', async () => {
		await service.startSession('parent-dir');
		otelService.fireSpan(makeToolCallSpan('parent-dir', 'read_file'));

		service.startChildSession('child-dir', 'parent-dir', 'runSubagent-default', 'tool-span-1');

		otelService.fireSpan(makeChatSpan('child-dir', 'claude-opus', 500, 100));

		await service.flush('parent-dir');
		await service.flush('child-dir');

		const childLogPath = service.getLogPath('child-dir');
		expect(childLogPath).toBeDefined();
		expect(childLogPath!.fsPath).toContain('parent-dir');
		expect(childLogPath!.fsPath).toContain('runSubagent-default-child-dir.jsonl');
	});

	it('child_session_ref includes childLogFile for direct file read fallback', async () => {
		await service.startSession('parent-file');
		otelService.fireSpan(makeToolCallSpan('parent-file', 'read_file'));

		service.startChildSession('child-file', 'parent-file', 'runSubagent-Explore', 'tool-span-2');

		otelService.fireSpan(makeChatSpan('child-file', 'claude-haiku', 100, 20));

		await service.flush('parent-file');
		await service.flush('child-file');

		const parentEntries = await readLogEntries('parent-file');
		const ref = parentEntries.find(e => e.type === 'child_session_ref');
		expect(ref).toBeDefined();
		expect((ref!.attrs as Record<string, unknown>).childLogFile).toBe('runSubagent-Explore-child-file.jsonl');
		expect((ref!.attrs as Record<string, unknown>).childSessionId).toBe('child-file');
	});

	it('readEntries returns child session entries', async () => {
		await service.startSession('parent-read');
		otelService.fireSpan(makeToolCallSpan('parent-read', 'read_file'));

		service.startChildSession('child-read', 'parent-read', 'runSubagent-default');

		otelService.fireSpan(makeToolCallSpan('child-read', 'file_search'));
		otelService.fireSpan(makeChatSpan('child-read', 'claude-haiku', 200, 50));

		await service.flush('parent-read');
		await service.flush('child-read');

		const childEntries = await service.readEntries('child-read');
		const types = childEntries.map(e => e.type);
		expect(types).toContain('session_start');
		expect(types).toContain('tool_call');
		expect(types).toContain('llm_request');
		expect(childEntries.length).toBe(3);
	});

	it('multiple child sessions under same parent each get their own file', async () => {
		await service.startSession('parent-multi');
		otelService.fireSpan(makeToolCallSpan('parent-multi', 'read_file'));

		service.startChildSession('child-a', 'parent-multi', 'runSubagent-Explore', 'tool-a');
		service.startChildSession('child-b', 'parent-multi', 'runSubagent-default', 'tool-b');

		otelService.fireSpan(makeChatSpan('child-a', 'claude-haiku', 100, 20));
		otelService.fireSpan(makeChatSpan('child-b', 'claude-haiku', 150, 30));

		await service.flush('parent-multi');
		await service.flush('child-a');
		await service.flush('child-b');

		// Parent should have two child_session_ref entries
		const parentEntries = await readLogEntries('parent-multi');
		const refs = parentEntries.filter(e => e.type === 'child_session_ref');
		expect(refs).toHaveLength(2);

		const labels = refs.map(r => (r.attrs as Record<string, unknown>).label);
		expect(labels).toContain('runSubagent-Explore');
		expect(labels).toContain('runSubagent-default');

		// Each child has its own log path
		const pathA = service.getLogPath('child-a');
		const pathB = service.getLogPath('child-b');
		expect(pathA).toBeDefined();
		expect(pathB).toBeDefined();
		expect(pathA!.fsPath).not.toBe(pathB!.fsPath);
	});

	it('routes hook spans to child session when registerSpanSession maps parentSpanId', async () => {
		// Set up parent session
		await service.startSession('parent-hook');
		otelService.fireSpan(makeToolCallSpan('parent-hook', 'read_file'));

		// Register child session and its invoke_agent span ID
		service.startChildSession('child-hook', 'parent-hook', 'runSubagent-default');
		service.registerSpanSession('invoke-agent-span-123', 'child-hook');

		// Fire a hook span with CHAT_SESSION_ID=parent but parentSpanId=child's invoke_agent
		const hookSpan = makeSpan({
			name: 'PreToolUse',
			spanId: 'hook-span-1',
			parentSpanId: 'invoke-agent-span-123',
			attributes: {
				[GenAiAttr.OPERATION_NAME]: 'execute_hook',
				[CopilotChatAttr.CHAT_SESSION_ID]: 'parent-hook', // Parent's session ID
			},
		});
		otelService.fireSpan(hookSpan);

		await service.flush('parent-hook');
		await service.flush('child-hook');

		// Hook should be written to child session, not parent
		const parentEntries = await readLogEntries('parent-hook');
		const parentHooks = parentEntries.filter(e => e.type === 'hook');
		expect(parentHooks).toHaveLength(0);

		const childEntries = await service.readEntries('child-hook');
		const childHooks = childEntries.filter(e => e.type === 'hook');
		expect(childHooks).toHaveLength(1);
		expect(childHooks[0].name).toBe('PreToolUse');
	});

	describe('listSessionIds', () => {
		it('returns empty when no sessions exist', async () => {
			const ids = await service.listSessionIds();
			expect(ids).toHaveLength(0);
		});

		it('lists session directories on disk', async () => {
			await service.startSession('session-a');
			otelService.fireSpan(makeToolCallSpan('session-a', 'read_file'));
			await service.flush('session-a');

			await service.startSession('session-b');
			otelService.fireSpan(makeToolCallSpan('session-b', 'edit_file'));
			await service.flush('session-b');

			const ids = await service.listSessionIds();
			expect(ids).toContain('session-a');
			expect(ids).toContain('session-b');
		});

		it('returns sessions sorted by most recently modified first', async () => {
			await service.startSession('older-session');
			otelService.fireSpan(makeToolCallSpan('older-session', 'read_file'));
			await service.flush('older-session');

			// Small delay so mtime differs
			await new Promise(resolve => setTimeout(resolve, 50));

			await service.startSession('newer-session');
			otelService.fireSpan(makeToolCallSpan('newer-session', 'edit_file'));
			await service.flush('newer-session');

			const ids = await service.listSessionIds();
			expect(ids.indexOf('newer-session')).toBeLessThan(ids.indexOf('older-session'));
		});

		it('does not include non-directory entries', async () => {
			// Create a session directory
			await service.startSession('real-session');
			otelService.fireSpan(makeToolCallSpan('real-session', 'read_file'));
			await service.flush('real-session');

			// Create a stray file in the debug-logs directory
			const debugLogsDir = service.debugLogsDir!;
			await fs.promises.writeFile(path.join(debugLogsDir.fsPath, 'stray-file.jsonl'), '{}');

			const ids = await service.listSessionIds();
			expect(ids).toContain('real-session');
			expect(ids).not.toContain('stray-file.jsonl');
		});

		it('handles stat failures gracefully', async () => {
			await service.startSession('good-session');
			otelService.fireSpan(makeToolCallSpan('good-session', 'read_file'));
			await service.flush('good-session');

			// Create an empty directory that can be listed but stat should still work
			const debugLogsDir = service.debugLogsDir!;
			await fs.promises.mkdir(path.join(debugLogsDir.fsPath, 'empty-dir'));

			const ids = await service.listSessionIds();
			expect(ids).toContain('good-session');
			expect(ids).toContain('empty-dir');
		});
	});
});
