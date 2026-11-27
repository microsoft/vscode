/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { parse, YamlMapNode, YamlNode } from '../../../../../base/common/yaml.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { PositionOffsetTransformer } from '../../../../../editor/common/core/text/positionToOffset.js';
import { LanguageSelector, score } from '../../../../../editor/common/languageSelector.js';
import { CompletionItem, CompletionItemKind, CompletionList } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { findUnreadModelRouterLine, IModelRouterKey, MODEL_ROUTER_FILE_SUFFIXES, MODEL_ROUTER_MAX_FILE_BYTES, ModelRouterDiagnosticSeverity, modelRouterKeys, modelRouterRouteKeys, parseModelRouter } from '../../../../../platform/agentHost/common/modelRouter.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';

const MARKERS_OWNER = 'modelRouter';
/** A router file is told by its name, wherever it is. */
const modelRouterFiles: LanguageSelector = { pattern: `**/*{${MODEL_ROUTER_FILE_SUFFIXES.join(',')}}` };
/** How long after a change the problems of a file are read again. */
const PROBLEMS_DELAY = 200;

/**
 * Completion and problems for model router files: the keys of a router and of its routes, the values of the keys
 * that take one of a fixed set, and what {@link parseModelRouter} finds wrong with a file.
 */
export class ModelRouterLanguageFeatures extends Disposable {

	private readonly problems = this._register(new DisposableMap<ITextModel>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IModelService modelService: IModelService,
		@IMarkerService private readonly markerService: IMarkerService,
	) {
		super();
		this._register(languageFeaturesService.completionProvider.register(modelRouterFiles, {
			_debugDisplayName: 'modelRouterCompletions',
			// Typing the `:` after a key offers its values.
			triggerCharacters: [':'],
			provideCompletionItems: (model, position) => provideCompletions(model, position),
		}));
		this._register(modelService.onModelAdded(model => this.showProblems(model)));
		this._register(modelService.onModelRemoved(model => this.problems.deleteAndDispose(model)));
		modelService.getModels().forEach(model => this.showProblems(model));
	}

	private showProblems(model: ITextModel): void {
		if (!score(modelRouterFiles, model.uri, model.getLanguageId(), true, undefined, undefined)) {
			return;
		}
		const store = new DisposableStore();
		this.problems.set(model, store);
		const update = () => this.markerService.changeOne(MARKERS_OWNER, model.uri, readProblems(model));
		const scheduler = store.add(new RunOnceScheduler(update, PROBLEMS_DELAY));
		store.add(model.onDidChangeContent(() => scheduler.schedule()));
		store.add(toDisposable(() => this.markerService.remove(MARKERS_OWNER, [model.uri])));
		update();
	}
}

function readProblems(model: ITextModel): IMarkerData[] {
	return parseModelRouter(model.getValue(), basename(model.uri)).diagnostics.map(({ severity, message, startOffset, endOffset }) => {
		// What has no place in the file, such as a key that is missing, is said on its first line.
		const range = startOffset !== undefined && endOffset !== undefined
			? Range.fromPositions(model.getPositionAt(startOffset), model.getPositionAt(endOffset))
			: new Range(1, 1, 1, model.getLineMaxColumn(1));
		return {
			severity: severity === ModelRouterDiagnosticSeverity.Error ? MarkerSeverity.Error : MarkerSeverity.Warning,
			message,
			startLineNumber: range.startLineNumber,
			startColumn: range.startColumn,
			endLineNumber: range.endLineNumber,
			endColumn: range.endColumn,
		};
	});
}

function provideCompletions(model: ITextModel, position: Position): CompletionList | undefined {
	// A larger file is not a router, and is not read on every key that is typed.
	if (model.getValueLength() > MODEL_ROUTER_MAX_FILE_BYTES) {
		return undefined;
	}
	const line = model.getLineContent(position.lineNumber);
	const before = line.slice(0, position.column - 1);
	// What is written of the word at the cursor after it, which a completion replaces too.
	const rest = /^[\w-]*/.exec(line.slice(position.column - 1))?.[0] ?? '';
	const after = line.slice(position.column - 1 + rest.length);
	const endColumn = position.column + rest.length;

	const atKey = /^(?<indent> *)(?<item>- +)?(?<typed>[A-Za-z][\w-]*)?$/.exec(before)?.groups;
	if (atKey) {
		const hasColon = after.startsWith(':');
		if (!hasColon && !isEndOfLine(after)) {
			return undefined;
		}
		const prefix = `${atKey.indent}${atKey.item ?? ''}`;
		// The value of a key that has one is kept: what follows the line can be part of it, as the text of a `|` block is.
		const map = keysAt(model, position.lineNumber, prefix, hasColon ? after : undefined);
		const range = new Range(position.lineNumber, prefix.length + 1, position.lineNumber, endColumn);
		return map && {
			suggestions: map.keys.flatMap((key, index): CompletionItem[] => map.used.has(key.name) ? [] : [{
				label: key.name,
				kind: CompletionItemKind.Property,
				insertText: hasColon ? key.name : key.isList ? `${key.name}:${separatorBefore(after)}` : `${key.name}: `,
				range,
				sortText: sortText(index),
				// The values of a key are offered once it is written.
				...(key.values && !hasColon ? { command: { id: 'editor.action.triggerSuggest', title: '' } } : {}),
			}]),
		};
	}

	const atValue = /^(?<indent> *)(?<item>- +)?(?<key>[\w-]+):(?<space> *)(?<quote>["']?)(?<typed>[\w-]*)$/.exec(before)?.groups;
	if (atValue) {
		// A value can be written in quotes, which are replaced with the value and written around it again.
		const { quote } = atValue;
		const isClosed = !!quote && after.startsWith(quote);
		const afterValue = isClosed ? after.slice(1) : after;
		const values = isEndOfLine(afterValue) ? keysAt(model, position.lineNumber, `${atValue.indent}${atValue.item ?? ''}`)?.keys.find(key => key.name === atValue.key)?.values : undefined;
		const range = new Range(position.lineNumber, position.column - atValue.typed.length - quote.length, position.lineNumber, endColumn + (isClosed ? 1 : 0));
		return values && {
			suggestions: values.map((value, index): CompletionItem => ({
				label: value,
				kind: CompletionItemKind.Value,
				insertText: `${atValue.space ? '' : ' '}${quote}${value}${quote}${separatorBefore(afterValue)}`,
				// What is written of a quoted value starts with its quote, so the value is found by it.
				...(quote ? { filterText: `${quote}${value}` } : {}),
				range,
				sortText: sortText(index),
			})),
		};
	}
	return undefined;
}

/** Whether nothing but a comment follows on a line. */
function isEndOfLine(text: string): boolean {
	return /^\s*(#.*)?$/.test(text);
}

/** A comment that follows right away needs a space before it, or it is read as part of what is written. */
function separatorBefore(text: string): string {
	return text.startsWith('#') ? ' ' : '';
}

/** Keeps completions in the order the format lists them, such as efforts from low to high. */
function sortText(index: number): string {
	return String(index).padStart(2, '0');
}

/** Stands for the key of the line at the cursor. */
const CURSOR_KEY = '__cursor__';
/** How many lines that the parser can't read as part of a router are repaired to find the keys at the cursor. */
const MAX_REPAIRS = 10;

/**
 * The keys that can be written on a line after `prefix`, its indentation and the `- ` of a list item: those of the
 * router, and those of a route in `routes`. `used` are the ones the router or that route already has. Anywhere
 * else, such as in text or in `examples`, there are none.
 *
 * The file is read with the parser the agent reads it with, so that a line is what it is to the agent. The line at
 * the cursor is read as a key of its own with `value` after it, since what is written of it is often not something
 * the parser reads. A file the parser reads is otherwise read as it is.
 */
function keysAt(model: ITextModel, lineNumber: number, prefix: string, value = ': x'): { readonly keys: readonly IModelRouterKey[]; readonly used: ReadonlySet<string> } | undefined {
	const lines = [...model.getLinesContent()];
	lines[lineNumber - 1] = `${prefix}${CURSOR_KEY}${value}`;
	for (let repairs = 0; ; repairs++) {
		const text = lines.join('\n');
		const positions = new PositionOffsetTransformer(text);
		const lineOf = (node: Pick<YamlNode, 'startOffset'>) => positions.getPosition(node.startOffset).lineNumber;
		let root: YamlNode | undefined;
		try {
			root = parse(text, []);
		} catch {
			// The parser throws on some text, such as an escape that names no character.
			return undefined;
		}
		const routes = root?.type === 'map' ? root.properties.find(property => property.key.value === 'routes')?.value : undefined;
		const items = routes?.type === 'sequence' ? routes.items : [];

		// A line on which a key is not finished keeps the parser from reading what follows it as part of the
		// router, so such a line is repaired and the file is read again.
		if (repairs < MAX_REPAIRS) {
			// A route that is a word is the first key of a route: it is read as that key, so that the route's other keys stay with it.
			const unfinished = items.find(item => item.type === 'scalar' && lineOf(item) !== lineNumber && /^ *- +[A-Za-z][\w-]*\s*$/.test(lines[lineOf(item) - 1]));
			if (unfinished) {
				lines[lineOf(unfinished) - 1] = `${lines[lineOf(unfinished) - 1].trimEnd()}:`;
				continue;
			}
			// The parser stops at a line it can't read, and reads a file that starts with one as text: the line is left out.
			const unread = root?.type === 'map' ? findUnreadModelRouterLine(text, root) : root;
			if (unread && lineOf(unread) !== lineNumber) {
				lines[lineOf(unread) - 1] = '';
				continue;
			}
		}

		const cursor = positions.getOffset(new Position(lineNumber, prefix.length + 1));
		const hasCursor = (node: YamlNode | undefined): node is YamlMapNode => {
			if (node?.type !== 'map' || !node.properties.some(property => property.key.startOffset === cursor)) {
				return false;
			}
			// The parser also reads a key that is indented further than the keys of a map as one of them, which the cursor's is not.
			const other = node.properties.find(property => property.key.startOffset !== cursor);
			return !other || positions.getPosition(other.key.startOffset).column === prefix.length + 1;
		};
		const map = hasCursor(root) ? root : items.find(hasCursor);
		return map && {
			keys: map === root ? modelRouterKeys : modelRouterRouteKeys,
			used: new Set(map.properties.filter(property => property.key.startOffset !== cursor).map(property => property.key.value)),
		};
	}
}
