/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Built-in scenario definitions for chat performance benchmarks and leak checks.
 *
 * Each test file imports this module and calls `registerScenario()` for the
 * scenarios it needs, keeping scenario ownership close to the test that uses it.
 */

const path = require('path');
const { ScenarioBuilder, registerScenario } = require('./mock-llm-server');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * @typedef {{
 *   description: string,
 *   chunks: import('./mock-llm-server').StreamChunk[],
 * }} ContentScenarioDef
 *
 * @typedef {{
 *   description: string,
 *   scenario: import('./mock-llm-server').MultiTurnScenario,
 * }} MultiTurnScenarioDef
 */

// -- Content-only scenarios ---------------------------------------------------

/** @type {Record<string, ContentScenarioDef>} */
const CONTENT_SCENARIOS = {
	'text-only': {
		description: 'Plain text, 4 paragraphs',
		chunks: new ScenarioBuilder()
			.stream([
				'Here is an explanation of the code you selected:\n\n',
				'The function `processItems` iterates over the input array and applies a transformation to each element. ',
				'It uses a `Map` to track previously seen values, which allows it to deduplicate results efficiently in O(n) time.\n\n',
				'The algorithm works in a single pass: for every element, it computes the transformed value, ',
				'checks membership in the set, and conditionally appends to the output array. ',
				'This is a common pattern in data processing pipelines where uniqueness constraints must be maintained.\n\n',
				'Edge cases to consider include empty arrays, duplicate transformations that produce the same key, ',
				'and items where the transform function itself is expensive.\n\n',
				'The time complexity is **O(n)** and the space complexity is **O(n)** in the worst case when all items are unique.\n',
			], 20)
			.build(),
	},

	'large-codeblock': {
		description: 'Single large TypeScript code block',
		chunks: new ScenarioBuilder()
			.stream([
				'Here is the refactored implementation:\n\n',
				'```typescript\n',
				'import { EventEmitter } from "events";\n\n',
				'interface CacheEntry<T> {\n  value: T;\n  expiresAt: number;\n  accessCount: number;\n}\n\n',
				'export class LRUCache<K, V> {\n',
				'  private readonly _map = new Map<K, CacheEntry<V>>();\n',
				'  private readonly _emitter = new EventEmitter();\n\n',
				'  constructor(\n    private readonly _maxSize: number,\n    private readonly _ttlMs: number = 60_000,\n  ) {}\n\n',
				'  get(key: K): V | undefined {\n    const entry = this._map.get(key);\n    if (!entry) { return undefined; }\n',
				'    if (Date.now() > entry.expiresAt) {\n      this._map.delete(key);\n      this._emitter.emit("evict", key);\n      return undefined;\n    }\n',
				'    entry.accessCount++;\n    this._map.delete(key);\n    this._map.set(key, entry);\n    return entry.value;\n  }\n\n',
				'  set(key: K, value: V): void {\n    if (this._map.size >= this._maxSize) {\n',
				'      const oldest = this._map.keys().next().value;\n      if (oldest !== undefined) {\n        this._map.delete(oldest);\n        this._emitter.emit("evict", oldest);\n      }\n    }\n',
				'    this._map.set(key, { value, expiresAt: Date.now() + this._ttlMs, accessCount: 0 });\n  }\n\n',
				'  clear(): void { this._map.clear(); this._emitter.emit("clear"); }\n',
				'  get size(): number { return this._map.size; }\n',
				'  onEvict(listener: (key: K) => void): void { this._emitter.on("evict", listener); }\n}\n',
				'```\n\n',
				'The key changes:\n- Added TTL-based expiry with configurable timeout\n- LRU eviction uses Map insertion order\n- EventEmitter notifies on evictions for cache observability\n',
			], 20)
			.build(),
	},

	'many-small-chunks': {
		description: '200 word-level chunks at 5ms',
		chunks: (() => {
			const words = ['Generating detailed analysis:\n\n'];
			for (let i = 0; i < 200; i++) { words.push(`Word${i} `); }
			words.push('\n\nAnalysis complete.\n');
			const b = new ScenarioBuilder();
			b.stream(words, 5);
			return b.build();
		})(),
	},

	'mixed-content': {
		description: 'Markdown + code block + fix suggestion',
		chunks: new ScenarioBuilder()
			.stream([
				'## Issue Found\n\n',
				'The `DisposableStore` is not being disposed in the `deactivate` path, ',
				'which can lead to memory leaks.\n\n',
				'### Current Code\n\n',
				'```typescript\nclass MyService {\n  private store = new DisposableStore();\n  // missing dispose!\n}\n```\n\n',
				'### Suggested Fix\n\n',
				'```typescript\nclass MyService extends Disposable {\n',
				'  private readonly store = this._register(new DisposableStore());\n\n',
				'  override dispose(): void {\n    this.store.dispose();\n    super.dispose();\n  }\n}\n```\n\n',
				'This ensures the store is cleaned up when the service is disposed via the workbench lifecycle.\n',
			], 20)
			.build(),
	},

	// -- Stress-test scenarios --------------------------------------------

	'many-codeblocks': {
		description: '10 code blocks, 60 lines each',
		chunks: (() => {
			const b = new ScenarioBuilder();
			b.emit('Here are the implementations for each module:\n\n');
			for (let i = 0; i < 10; i++) {
				b.wait(10, `### Module ${i + 1}: \`handler${i}.ts\`\n\n`);
				b.emit('```typescript\n');
				const lines = [];
				for (let j = 0; j < 15; j++) {
					lines.push(`export function handle${i}_${j}(input: string): string {\n`);
					lines.push(`  const result = input.trim().split('').reverse().join('');\n`);
					lines.push(`  return \`[\${result}] processed by handler ${i}_${j}\`;\n`);
					lines.push('}\n\n');
				}
				b.stream(lines, 5);
				b.emit('```\n\n');
			}
			b.emit('All modules implement the same pattern with unique handler IDs.\n');
			return b.build();
		})(),
	},

	'long-prose': {
		description: '15 sections, ~3000 words of prose',
		chunks: (() => {
			const sentences = [
				'The architecture follows a layered dependency injection pattern where each service declares its dependencies through constructor parameters. ',
				'This approach ensures that circular dependencies are detected at compile time rather than at runtime, which significantly reduces debugging overhead. ',
				'When a service is instantiated, the instantiation service resolves all of its dependencies recursively, creating a directed acyclic graph of service instances. ',
				'Each service is a singleton within its scope, meaning that multiple consumers of the same service interface receive the same instance. ',
				'The workbench lifecycle manages the creation and disposal of these services through well-defined phases: creation, restoration, and eventual shutdown. ',
				'During the restoration phase, services that persist state across sessions reload their data from storage, which may involve asynchronous operations. ',
				'Contributors register their functionality through extension points, which are processed during the appropriate lifecycle phase. ',
				'This contribution model allows features to be added without modifying the core workbench code, maintaining a clean separation of concerns. ',
			];
			const b = new ScenarioBuilder();
			b.emit('# Detailed Architecture Analysis\n\n');
			for (let para = 0; para < 15; para++) {
				b.wait(15, `## Section ${para + 1}: ${['Overview', 'Design Patterns', 'Service Layer', 'Event System', 'State Management', 'Error Handling', 'Performance', 'Testing', 'Deployment', 'Monitoring', 'Security', 'Extensibility', 'Compatibility', 'Migration', 'Future Work'][para]}\n\n`);
				const paraSentences = [];
				for (let s = 0; s < 25; s++) { paraSentences.push(sentences[s % sentences.length]); }
				b.stream(paraSentences, 8);
				b.emit('\n\n');
			}
			return b.build();
		})(),
	},

	'rich-markdown': {
		description: '6 sections × 5 items, bold/links/code spans',
		chunks: (() => {
			const b = new ScenarioBuilder();
			b.emit('# Comprehensive Code Review Report\n\n');
			b.wait(15, '> **Summary**: Found 12 issues across 4 severity levels.\n\n');
			for (let section = 0; section < 6; section++) {
				b.wait(10, `## ${section + 1}. ${['Critical Issues', 'Performance Concerns', 'Code Style', 'Documentation Gaps', 'Test Coverage', 'Security Review'][section]}\n\n`);
				for (let item = 0; item < 5; item++) {
					b.stream([
						`${item + 1}. **Issue ${section * 5 + item + 1}**: \`${['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef'][item]}\` in \`src/components/Widget${item}.tsx\`\n`,
						`   - Severity: ${['[Critical]', '[Warning]', '[Info]', '[Suggestion]', '[Note]'][item]}\n`,
						`   - The current implementation uses *unnecessary re-renders* due to missing dependency arrays.\n`,
						`   - See [React docs](https://react.dev/reference) and the [\`useMemo\` guide](https://react.dev/reference/react/useMemo).\n`,
						`   - Fix: wrap in \`useCallback\` or extract to a ***separate memoized component***.\n\n`,
					], 10);
				}
				b.emit('---\n\n');
			}
			b.emit('> *Report generated automatically. Please review all suggestions before applying.*\n');
			return b.build();
		})(),
	},

	'giant-codeblock': {
		description: '40 classes in one fenced code block',
		chunks: (() => {
			const b = new ScenarioBuilder();
			b.emit('Here is the complete implementation:\n\n```typescript\n');
			b.stream([
				'import { Disposable, DisposableStore } from "vs/base/common/lifecycle";\n',
				'import { Emitter, Event } from "vs/base/common/event";\n',
				'import { URI } from "vs/base/common/uri";\n\n',
			], 10);
			for (let i = 0; i < 40; i++) {
				b.stream([
					`export class Service${i} extends Disposable {\n`,
					`  private readonly _onDidChange = this._register(new Emitter<void>());\n`,
					`  readonly onDidChange: Event<void> = this._onDidChange.event;\n\n`,
					`  private _value: string = '';\n`,
					`  get value(): string { return this._value; }\n\n`,
					`  async update(uri: URI): Promise<void> {\n`,
					`    this._value = uri.toString();\n`,
					`    this._onDidChange.fire();\n`,
					`  }\n`,
					'}\n\n',
				], 5);
			}
			b.emit('```\n\nThis defines 40 service classes following the standard VS Code pattern.\n');
			return b.build();
		})(),
	},

	'rapid-stream': {
		description: '1000 tokens at 2ms (streaming stress test)',
		chunks: (() => {
			const b = new ScenarioBuilder();
			const words = [];
			for (let i = 0; i < 1000; i++) { words.push(`w${i} `); }
			// Very fast inter-chunk delay to stress the streaming pipeline
			b.stream(words, 2);
			return b.build();
		})(),
	},

	'file-links': {
		description: '32 file references with line links',
		chunks: (() => {
			const files = [
				'src/vs/workbench/contrib/chat/browser/chatListRenderer.ts',
				'src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts',
				'src/vs/workbench/contrib/chat/browser/widget/input/chatInputPart.ts',
				'src/vs/workbench/contrib/chat/common/chatPerf.ts',
				'src/vs/base/common/lifecycle.ts',
				'src/vs/base/common/event.ts',
				'src/vs/platform/instantiation/common/instantiation.ts',
				'src/vs/workbench/services/extensions/common/abstractExtensionService.ts',
				'src/vs/workbench/api/common/extHostLanguageModels.ts',
				'src/vs/workbench/contrib/chat/common/languageModels.ts',
				'src/vs/editor/browser/widget/codeEditor/editor.ts',
				'src/vs/workbench/browser/parts/editor/editorGroupView.ts',
			];
			const b = new ScenarioBuilder();
			b.emit('I found references to the disposable pattern across the following files:\n\n');
			for (let i = 0; i < files.length; i++) {
				const line = Math.floor(Math.random() * 500) + 1;
				b.stream([
					`${i + 1}. [${files[i]}](${files[i]}#L${line}) -- `,
					`Line ${line}: uses \`DisposableStore\` with ${Math.floor(Math.random() * 10) + 1} registrations\n`,
				], 15);
			}
			b.wait(10, '\nAdditionally, the following files import from `vs/base/common/lifecycle`:\n\n');
			for (let i = 0; i < 20; i++) {
				const depth = ['base', 'platform', 'editor', 'workbench'][i % 4];
				const area = ['common', 'browser', 'node', 'electron-browser'][i % 4];
				const name = ['service', 'provider', 'contribution', 'handler', 'manager'][i % 5];
				const file = `src/vs/${depth}/${area}/${name}${i}.ts`;
				b.stream([
					`- [${file}](${file}#L${i * 10 + 5})`,
					` -- imports \`Disposable\`, \`DisposableStore\`\n`,
				], 12);
			}
			b.emit('\nTotal: 32 files reference the disposable pattern.\n');
			return b.build();
		})(),
	},
};

// -- Tool call scenarios ------------------------------------------------------

/** @type {Record<string, MultiTurnScenarioDef>} */
const TOOL_CALL_SCENARIOS = {
	'tool-read-file': {
		description: 'Read 8 files across 2 tool-call rounds',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ((() => {
			const filesToRead = [
				'_chatperf_lifecycle.ts',
				'_chatperf_event.ts',
				'_chatperf_uri.ts',
				'_chatperf_errors.ts',
				'_chatperf_async.ts',
				'_chatperf_strings.ts',
				'_chatperf_arrays.ts',
				'_chatperf_types.ts',
			];
			// Round 1: parallel read of first 4 files
			// Round 2: parallel read of next 4 files
			// Round 3: final content response
			return {
				type: 'multi-turn',
				turns: [
					{
						kind: 'tool-calls',
						toolCalls: filesToRead.slice(0, 4).map(f => ({
							toolNamePattern: /read.?file/i,
							arguments: { filePath: path.join(FIXTURES_DIR, f), startLine: 1, endLine: 50 },
						})),
					},
					{
						kind: 'tool-calls',
						toolCalls: filesToRead.slice(4).map(f => ({
							toolNamePattern: /read.?file/i,
							arguments: { filePath: path.join(FIXTURES_DIR, f), startLine: 1, endLine: 50 },
						})),
					},
					{
						kind: 'content',
						chunks: new ScenarioBuilder()
							.wait(20, '## Analysis of VS Code Base Utilities\n\n')
							.stream([
								'I read 8 core utility files from `src/vs/base/common/`. Here is a summary:\n\n',
								'### lifecycle.ts\n',
								'The `Disposable` base class provides the standard lifecycle pattern. Components register cleanup ',
								'handlers via `this._register()` which are automatically disposed when the parent is disposed.\n\n',
								'### event.ts\n',
								'The `Emitter` class implements the observer pattern. `Event.once()`, `Event.map()`, and `Event.filter()` ',
								'provide functional combinators for composing event streams.\n\n',
								'### uri.ts\n',
								'`URI` is an immutable representation of a resource identifier with scheme, authority, path, query, and fragment.\n\n',
								'### errors.ts\n',
								'Central error handling with `onUnexpectedError()` and `isCancellationError()` for distinguishing user cancellation.\n\n',
								'### async.ts\n',
								'`Throttler`, `Delayer`, `RunOnceScheduler`, and `Queue` manage async operation scheduling and deduplication.\n\n',
								'### strings.ts\n',
								'String utilities including `format()`, `escape()`, `startsWith()`, and `endsWith()` for common string operations.\n\n',
								'### arrays.ts\n',
								'Array helpers like `coalesce()`, `groupBy()`, `distinct()`, and binary search implementations.\n\n',
								'### types.ts\n',
								'Type guards and assertion helpers: `isString()`, `isNumber()`, `assertType()`, `assertIsDefined()`.\n',
							], 15)
							.build(),
					},
				],
			};
		})()),
	},

	'tool-edit-file': {
		description: 'Read 3 files, edit 2 (read + write rounds)',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ((() => {
			const readFiles = [
				'_chatperf_lifecycle.ts',
				'_chatperf_event.ts',
				'_chatperf_errors.ts',
			];
			return {
				type: 'multi-turn',
				turns: [
					// Round 1: read all 3 files in parallel
					{
						kind: 'tool-calls',
						toolCalls: readFiles.map(f => ({
							toolNamePattern: /read.?file/i,
							arguments: { filePath: path.join(FIXTURES_DIR, f), startLine: 1, endLine: 40 },
						})),
					},
					// Round 2: edit 2 files in parallel
					{
						kind: 'tool-calls',
						toolCalls: [
							{
								toolNamePattern: /insert.?edit|replace.?string|apply.?patch/i,
								arguments: {
									filePath: path.join(FIXTURES_DIR, '_chatperf_lifecycle.ts'),
									explanation: 'Update the benchmark marker comment in lifecycle.ts',
									code: '// perf-benchmark-marker (updated)',
								},
							},
							{
								toolNamePattern: /insert.?edit|replace.?string|apply.?patch/i,
								arguments: {
									filePath: path.join(FIXTURES_DIR, '_chatperf_event.ts'),
									explanation: 'Update the benchmark marker comment in event.ts',
									code: '// perf-benchmark-marker (updated)',
								},
							},
						],
					},
					// Round 3: final content
					{
						kind: 'content',
						chunks: new ScenarioBuilder()
							.wait(20, '## Edits Applied\n\n')
							.stream([
								'I read 3 files and applied edits to 2 of them:\n\n',
								'### Files read:\n',
								'1. `src/vs/base/common/lifecycle.ts` — Disposable pattern and lifecycle management\n',
								'2. `src/vs/base/common/event.ts` — Event emitter and observer pattern\n',
								'3. `src/vs/base/common/errors.ts` — Error handling utilities\n\n',
								'### Edits applied:\n',
								'1. **lifecycle.ts** — Updated the benchmark marker comment\n',
								'2. **event.ts** — Updated the benchmark marker comment\n\n',
								'Both files follow the standard VS Code pattern of using `Disposable` as a base class ',
								'with `_register()` for lifecycle management. The edits were minimal and localized.\n',
							], 20)
							.build(),
					},
				],
			};
		})()),
	},

	'tool-terminal': {
		description: 'Run commands, read output, fix + rerun',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ({
			type: 'multi-turn',
			turns: [
				// Round 1: run initial commands (install + build)
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /run.?in.?terminal|execute.?command/i,
							arguments: {
								command: 'echo "Installing dependencies..." && echo "added 1631 packages in 6m"',
								explanation: 'Install project dependencies',
								goal: 'Install dependencies',
								mode: 'sync',
								timeout: 30000,
							},
						},
					],
				},
				// Round 2: run test command
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /run.?in.?terminal|execute.?command/i,
							arguments: {
								command: 'echo "Running unit tests..." && echo "  42 passing (3s)" && echo "  2 failing" && echo "" && echo "  1) ChatService should dispose listeners" && echo "     AssertionError: expected 0 to equal 1" && echo "  2) ChatModel should clear on new session" && echo "     TypeError: Cannot read property dispose of undefined"',
								explanation: 'Run the unit test suite to check for failures',
								goal: 'Run tests',
								mode: 'sync',
								timeout: 60000,
							},
						},
					],
				},
				// Round 3: read the failing test file for context
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /read.?file/i,
							arguments: { filePath: path.join(FIXTURES_DIR, '_chatperf_lifecycle.ts'), startLine: 1, endLine: 50 },
						},
					],
				},
				// Round 4: fix the issue with an edit
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /insert.?edit|replace.?string|apply.?patch/i,
							arguments: {
								filePath: path.join(FIXTURES_DIR, '_chatperf_lifecycle.ts'),
								explanation: 'Fix the dispose call in the test',
								code: '// perf-benchmark-marker (fixed)',
							},
						},
					],
				},
				// Round 5: re-run tests to confirm
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /run.?in.?terminal|execute.?command/i,
							arguments: {
								command: 'echo "Running unit tests..." && echo "  44 passing (3s)" && echo "  0 failing"',
								explanation: 'Re-run tests to verify the fix',
								goal: 'Verify fix',
								mode: 'sync',
								timeout: 60000,
							},
						},
					],
				},
				// Round 6: final summary
				{
					kind: 'content',
					chunks: new ScenarioBuilder()
						.wait(20, '## Test Failures Fixed\n\n')
						.stream([
							'I found and fixed 2 test failures:\n\n',
							'### Root Cause\n',
							'The `ChatService` was not properly disposing event listeners when a session was cleared. ',
							'The `dispose()` method was missing a call to `this._store.dispose()`.\n\n',
							'### Changes Made\n',
							'Updated `lifecycle.ts` to properly chain disposal:\n\n',
							'```typescript\n',
							'override dispose(): void {\n',
							'  this._store.dispose();\n',
							'  super.dispose();\n',
							'}\n',
							'```\n\n',
							'### Test Results\n',
							'- **Before**: 42 passing, 2 failing\n',
							'- **After**: 44 passing, 0 failing\n\n',
							'All tests pass now. The fix ensures listeners are cleaned up during session transitions.\n',
						], 15)
						.build(),
				},
			],
		}),
	},
};

// -- Multi-turn user conversation scenarios -----------------------------------

/** @type {Record<string, MultiTurnScenarioDef>} */
const MULTI_TURN_SCENARIOS = {
	'thinking-response': {
		description: 'Thinking block before content response',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ({
			type: 'multi-turn',
			turns: [
				{
					kind: 'thinking',
					thinkingChunks: new ScenarioBuilder()
						.stream([
							'Let me analyze this code carefully. ',
							'The user is asking about the lifecycle pattern in VS Code. ',
							'I should look at the Disposable base class and how it manages cleanup. ',
							'The key methods are _register(), dispose(), and the DisposableStore pattern. ',
							'I need to read the file first to give an accurate explanation.',
						], 15)
						.build(),
					chunks: new ScenarioBuilder()
						.wait(20, 'I\'ll start by reading the file to understand its structure.\n\n')
						.stream([
							'The `Disposable` base class in `lifecycle.ts` provides a standard pattern ',
							'for managing resources. It uses a `DisposableStore` internally to track ',
							'all registered disposables and clean them up on `dispose()`.\n',
						], 20)
						.build(),
				},
			],
		}),
	},

	'multi-turn-user': {
		description: '2 user follow-ups with thinking + code',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ({
			type: 'multi-turn',
			turns: [
				// Turn 1: Model reads a file
				{
					kind: 'tool-calls',
					toolCalls: [
						{
							toolNamePattern: /read.?file/i,
							arguments: {
								filePath: path.join(FIXTURES_DIR, '_chatperf_lifecycle.ts'),
								offset: 1,
								limit: 50,
							},
						},
					],
				},
				// Turn 2: Model responds with analysis
				{
					kind: 'content',
					chunks: new ScenarioBuilder()
						.wait(20, 'I\'ve read the file. Here\'s what I found:\n\n')
						.stream([
							'The `Disposable` class is the base for lifecycle management. ',
							'It internally holds a `DisposableStore` via `this._store`. ',
							'Subclasses call `this._register()` to track their own disposables.\n\n',
							'Would you like me to explain any specific part in more detail?\n',
						], 20)
						.build(),
				},
				// Turn 3: User follow-up (injected by test harness, not served by mock)
				{
					kind: 'user',
					message: 'Yes, explain the MutableDisposable pattern',
				},
				// Turn 4: Model responds with thinking, then content
				{
					kind: 'thinking',
					thinkingChunks: new ScenarioBuilder()
						.stream([
							'The user wants to understand MutableDisposable specifically. ',
							'Let me recall the key aspects: it holds a single disposable that can be swapped. ',
							'When a new value is set, the old one is automatically disposed. ',
							'This is useful for things like event listener subscriptions that need to be replaced.',
						], 10)
						.build(),
					chunks: new ScenarioBuilder()
						.wait(15, '## MutableDisposable\n\n')
						.stream([
							'`MutableDisposable<T>` holds a **single disposable** that can be swapped at any time. ',
							'When you set a new value via `.value = newDisposable`, the previous value is automatically disposed.\n\n',
							'This is perfect for:\n',
							'- **Event listeners** that need to be re-subscribed when configuration changes\n',
							'- **Editor decorations** that are replaced when content updates\n',
							'- **Watchers** that switch targets dynamically\n\n',
							'```typescript\n',
							'class MyService extends Disposable {\n',
							'  private readonly _listener = this._register(new MutableDisposable());\n\n',
							'  updateTarget(editor: ICodeEditor): void {\n',
							'    // Old listener is automatically disposed\n',
							'    this._listener.value = editor.onDidChangeModel(() => {\n',
							'      this._handleModelChange();\n',
							'    });\n',
							'  }\n',
							'}\n',
							'```\n\n',
							'The key benefit is that you never forget to dispose the old subscription.\n',
						], 15)
						.build(),
				},
				// Turn 5: Second user follow-up
				{
					kind: 'user',
					message: 'Can you also show me DisposableMap?',
				},
				// Turn 6: Final response
				{
					kind: 'content',
					chunks: new ScenarioBuilder()
						.wait(20, '## DisposableMap\n\n')
						.stream([
							'`DisposableMap<K, V>` extends `Map` with automatic disposal semantics:\n\n',
							'- When a key is **overwritten**, the old value is disposed\n',
							'- When a key is **deleted**, the value is disposed\n',
							'- When the map itself is **disposed**, all values are disposed\n\n',
							'```typescript\n',
							'class ToolManager extends Disposable {\n',
							'  private readonly _tools = this._register(new DisposableMap<string, IDisposable>());\n\n',
							'  registerTool(id: string, tool: IDisposable): void {\n',
							'    this._tools.set(id, tool); // auto-disposes previous tool with same id\n',
							'  }\n',
							'}\n',
							'```\n\n',
							'This is commonly used for managing collections of disposable resources keyed by ID.\n',
						], 15)
						.build(),
				},
			],
		}),
	},
	'long-conversation': {
		description: '10 user turns, mixed content types',
		scenario: /** @type {import('./mock-llm-server').MultiTurnScenario} */ ((() => {
			const topics = [
				{ question: 'How does the Disposable pattern work?', heading: 'Disposable Pattern', content: 'The `Disposable` base class provides lifecycle management. Subclasses call `this._register()` to track child disposables that are cleaned up automatically when `dispose()` is called.' },
				{ question: 'What about DisposableStore?', heading: 'DisposableStore', content: '`DisposableStore` aggregates multiple `IDisposable` instances and disposes them all at once. It tracks whether it has already been disposed and throws if you try to add after disposal.' },
				{ question: 'How does the Event system work?', heading: 'Event System', content: 'The `Emitter<T>` class implements the observer pattern. `Event.once()`, `Event.map()`, `Event.filter()`, and `Event.debounce()` provide functional combinators for composing event streams.' },
				{ question: 'Explain dependency injection', heading: 'Dependency Injection', content: 'Services are injected through constructor parameters decorated with service identifiers. The `IInstantiationService` resolves dependencies recursively, creating singletons within each scope.' },
				{ question: 'What is the contribution model?', heading: 'Contribution Model', content: 'Features register functionality through extension points like `Registry.as<IWorkbenchContributionsRegistry>()`. Contributions are instantiated during specific lifecycle phases.' },
				{ question: 'How does the editor handle text models?', heading: 'Text Models', content: 'The `TextModel` class manages document content with line-based storage. It supports undo/redo stacks, bracket matching, tokenization, and change tracking via edit operations.' },
				{ question: 'Explain the extension host architecture', heading: 'Extension Host', content: 'Extensions run in a separate process (or worker) called the extension host. Communication happens via an RPC protocol over `IPC`. The main process proxies API calls back to the workbench.' },
				{ question: 'How does file watching work?', heading: 'File Watching', content: 'The `IFileService` supports correlated and shared file watchers. Correlated watchers are preferred as they track specific resources. The underlying implementation uses `chokidar` or `parcel/watcher`.' },
				{ question: 'What about the tree widget?', heading: 'Tree Widget', content: 'The `AsyncDataTree` and `ObjectTree` provide virtualized tree rendering. They support filtering, sorting, keyboard navigation, and accessibility. The `ITreeRenderer` interface handles element rendering.' },
				{ question: 'How does the settings editor work?', heading: 'Settings Editor', content: 'Settings are declared in `package.json` contribution points. The settings editor reads the configuration registry, groups settings by category, and renders appropriate input controls for each type.' },
			];

			/** @type {import('./mock-llm-server').ScenarioTurn[]} */
			const turns = [];

			// Turn 1: Initial model response (no user turn needed before the first)
			const firstTopic = topics[0];
			turns.push({
				kind: 'content',
				chunks: new ScenarioBuilder()
					.wait(20, `## ${firstTopic.heading}\n\n`)
					.stream([
						`${firstTopic.content}\n\n`,
						'Here is a typical example:\n\n',
						'```typescript\n',
						'class MyService extends Disposable {\n',
						'  private readonly _onDidChange = this._register(new Emitter<void>());\n',
						'  readonly onDidChange: Event<void> = this._onDidChange.event;\n\n',
						'  constructor(@IFileService private readonly fileService: IFileService) {\n',
						'    super();\n',
						'    this._register(fileService.onDidFilesChange(e => this._handleChange(e)));\n',
						'  }\n',
						'}\n',
						'```\n\n',
						'Would you like to know more about any specific aspect?\n',
					], 15)
					.build(),
			});

			// Turns 2..N: alternating user follow-up + model response
			for (let i = 1; i < topics.length; i++) {
				const topic = topics[i];

				// User follow-up
				turns.push({ kind: 'user', message: topic.question });

				// Model response — vary content type to stress different renderers
				const b = new ScenarioBuilder();
				b.wait(20, `## ${topic.heading}\n\n`);

				// Main explanation
				const sentences = topic.content.split('. ');
				b.stream(sentences.map(s => s.endsWith('.') ? s + ' ' : s + '. '), 12);
				b.emit('\n\n');

				if (i % 3 === 0) {
					// Every 3rd response: large code block
					b.emit('```typescript\n');
					for (let j = 0; j < 8; j++) {
						b.stream([
							`export class ${topic.heading.replace(/\s/g, '')}Part${j} extends Disposable {\n`,
							`  private readonly _state = new Map<string, unknown>();\n\n`,
							`  process(input: string): string {\n`,
							`    const cached = this._state.get(input);\n`,
							`    if (cached) { return String(cached); }\n`,
							`    const result = input.split('').reverse().join('');\n`,
							`    this._state.set(input, result);\n`,
							`    return result;\n`,
							`  }\n`,
							'}\n\n',
						], 5);
					}
					b.emit('```\n\n');
				} else if (i % 3 === 1) {
					// Every 3rd+1 response: bullet list with bold + inline code
					b.emit('Key points to remember:\n\n');
					for (let j = 0; j < 6; j++) {
						b.stream([
							`${j + 1}. **Point ${j + 1}**: The \`${topic.heading.replace(/\s/g, '')}${j}\` `,
							`component uses the standard pattern with \`_register()\` for lifecycle. `,
							`It handles edge cases like ${['empty input', 'null references', 'concurrent access', 'circular deps', 'timeout expiry', 'disposal races'][j]}.\n`,
						], 10);
					}
					b.emit('\n');
				} else {
					// Every 3rd+2 response: mixed prose + small code snippet
					b.stream([
						'This pattern is used extensively throughout the codebase. ',
						'The key insight is that resources are always tracked from creation, ',
						'ensuring no leaks even in error paths. ',
						'The ownership chain is explicit and follows the component hierarchy.\n\n',
					], 12);
					b.emit('Quick example:\n\n```typescript\n');
					b.stream([
						`const store = new DisposableStore();\n`,
						`store.add(event.on(() => { /* handler */ }));\n`,
						`store.add(watcher.watch(uri));\n`,
						`// Later: store.dispose(); // cleans up everything\n`,
					], 8);
					b.emit('```\n\n');
				}

				b.stream([
					`That covers the essentials of **${topic.heading}**. `,
					'Let me know if you want to dive deeper into any of these concepts.\n',
				], 15);

				turns.push({
					kind: 'content',
					chunks: b.build(),
				});
			}

			return { type: 'multi-turn', turns };
		})()),
	},
};

// -- Registration helper ------------------------------------------------------

/**
 * Get a brief description of a scenario by ID.
 * @param {string} id
 * @returns {string}
 */
function getScenarioDescription(id) {
	const content = CONTENT_SCENARIOS[id];
	if (content) { return content.description; }
	const tool = TOOL_CALL_SCENARIOS[id];
	if (tool) { return tool.description; }
	const multi = MULTI_TURN_SCENARIOS[id];
	if (multi) { return multi.description; }
	return '';
}

/**
 * Register all built-in perf scenarios into the mock LLM server.
 * Call this from your test file before starting the server.
 */
function registerPerfScenarios() {
	for (const [id, def] of Object.entries(CONTENT_SCENARIOS)) {
		registerScenario(id, def.chunks);
	}
	for (const [id, def] of Object.entries(TOOL_CALL_SCENARIOS)) {
		registerScenario(id, def.scenario);
	}
	for (const [id, def] of Object.entries(MULTI_TURN_SCENARIOS)) {
		registerScenario(id, def.scenario);
	}
}

module.exports = { registerPerfScenarios, getScenarioDescription, CONTENT_SCENARIOS, TOOL_CALL_SCENARIOS, MULTI_TURN_SCENARIOS };
