/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LanguageSelector, score } from '../../../../../editor/common/languageSelector.js';
import { CompletionItem, CompletionItemKind, CompletionList } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IModelRouterKey, MODEL_ROUTER_FILE_SUFFIXES, ModelRouterDiagnosticSeverity, modelRouterKeys, modelRouterRouteKeys, parseModelRouter } from '../../../../../platform/agentHost/common/modelRouter.js';
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
	const line = model.getLineContent(position.lineNumber);
	const before = line.slice(0, position.column - 1);
	// What is written of the word at the cursor after it, which a completion replaces too.
	const rest = /^[\w-]*/.exec(line.slice(position.column - 1))?.[0] ?? '';
	const after = line.slice(position.column - 1 + rest.length);
	const endColumn = position.column + rest.length;
	const hasNothingAfter = /^\s*(#.*)?$/.test(after);

	const atKey = /^(?<indent> *)(?<item>- +)?(?<typed>[A-Za-z][\w-]*)?$/.exec(before)?.groups;
	if (atKey) {
		const hasColon = after.startsWith(':');
		if (!hasColon && !hasNothingAfter) {
			return undefined;
		}
		const column = atKey.indent.length + (atKey.item?.length ?? 0);
		const map = keysAt(model, position.lineNumber, atKey.indent.length, column, !!atKey.item);
		const range = new Range(position.lineNumber, column + 1, position.lineNumber, endColumn);
		return map && {
			suggestions: map.keys.flatMap((key, index): CompletionItem[] => map.used.has(key.name) ? [] : [{
				label: key.name,
				kind: CompletionItemKind.Property,
				insertText: hasColon ? key.name : key.isList ? `${key.name}:` : `${key.name}: `,
				range,
				sortText: sortText(index),
				// The values of a key are offered once it is written.
				...(key.values && !hasColon ? { command: { id: 'editor.action.triggerSuggest', title: '' } } : {}),
			}]),
		};
	}

	const atValue = /^(?<indent> *)(?<item>- +)?(?<key>[\w-]+):(?<space> *)(?<typed>[\w-]*)$/.exec(before)?.groups;
	if (atValue && hasNothingAfter) {
		const column = atValue.indent.length + (atValue.item?.length ?? 0);
		const values = keysAt(model, position.lineNumber, atValue.indent.length, column, !!atValue.item)?.keys.find(key => key.name === atValue.key)?.values;
		const range = new Range(position.lineNumber, position.column - atValue.typed.length, position.lineNumber, endColumn);
		return values && {
			suggestions: values.map((value, index): CompletionItem => ({
				label: value,
				kind: CompletionItemKind.Value,
				insertText: atValue.space ? value : ` ${value}`,
				range,
				sortText: sortText(index),
			})),
		};
	}
	return undefined;
}

/** Keeps completions in the order the format lists them, such as efforts from low to high. */
function sortText(index: number): string {
	return String(index).padStart(2, '0');
}

interface ILine {
	/** How far the line is indented. */
	readonly indent: number;
	/** Where its text starts, from 0: after the `- ` of a list item, else at its indent. */
	readonly column: number;
	readonly isItem: boolean;
	/** The key the line starts, when it starts one. */
	readonly key?: string;
}

/** A line of a router file, or `undefined` for one that is empty or a comment. */
function readLine(text: string): ILine | undefined {
	const groups = /^\s*(#|$)/.test(text) ? undefined : /^(?<indent> *)(?<item>-(?: +|$))?(?:(?<key>[\w-]+):(?: |$))?/.exec(text)?.groups;
	return groups && { indent: groups.indent.length, column: groups.indent.length + (groups.item?.length ?? 0), isItem: !!groups.item, ...(groups.key ? { key: groups.key } : {}) };
}

/**
 * The keys that can be written at `column` of a line: those of the router at the start of a line, and those of a
 * route in an item of the top-level `routes`. `used` are the ones the router or that route already has. Anywhere
 * else, such as in the text of a `|` block or in `examples`, there are none.
 *
 * Lines are told apart by their indentation and not by parsing the file, since a file that is being written is
 * often one the parser can't read.
 */
function keysAt(model: ITextModel, lineNumber: number, indent: number, column: number, isItem: boolean): { readonly keys: readonly IModelRouterKey[]; readonly used: ReadonlySet<string> } | undefined {
	const lines = model.getLinesContent().map(readLine);
	const index = lineNumber - 1;
	const used = new Set<string>();
	if (column === 0) {
		lines.forEach((line, i) => {
			if (i !== index && line?.key && line.column === 0 && !line.isItem) {
				used.add(line.key);
			}
		});
		return { keys: modelRouterKeys, used };
	}

	// The list item the line is part of: the line itself, or the closest one above whose keys are at this column.
	let item = isItem ? { index, indent } : undefined;
	for (let i = index - 1; !item && i >= 0; i--) {
		const line = lines[i];
		// Deeper lines are the value of a key of the item, as is a list written at the indent of its key.
		if (!line || line.indent > column || (line.isItem && line.indent === column)) {
			continue;
		}
		if (line.isItem && line.column === column) {
			item = { index: i, indent: line.indent };
		} else if (line.isItem || line.indent < column) {
			return undefined;
		}
	}
	if (!item) {
		return undefined;
	}

	// A route is an item of the top-level `routes`, which is the closest line above the item that is not part of the list.
	let parent: ILine | undefined;
	for (let i = item.index - 1; !parent && i >= 0; i--) {
		const line = lines[i];
		if (line && line.indent <= item.indent && !(line.isItem && line.indent === item.indent)) {
			parent = line;
		}
	}
	if (!parent || parent.isItem || parent.indent !== 0 || parent.key !== 'routes') {
		return undefined;
	}

	// The item ends at the next line that is not indented further than it.
	for (let i = item.index; i < lines.length; i++) {
		const line = lines[i];
		if (i > item.index && line && line.indent <= item.indent) {
			break;
		}
		if (i !== index && line?.key && line.column === column && (i === item.index || !line.isItem)) {
			used.add(line.key);
		}
	}
	return { keys: modelRouterRouteKeys, used };
}
