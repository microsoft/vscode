/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { JSONPath } from '../../../../base/common/json.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IMultiDiffEditorLayoutDebugState } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';

type JsonValue = null | boolean | number | string | readonly JsonValue[] | object;

export type JsonPatchOperation =
	| { readonly op: 'add' | 'replace'; readonly path: string; readonly value: JsonValue }
	| { readonly op: 'remove'; readonly path: string };

export type JsonPatch = readonly (JsonPatchOperation | JsonPatch)[];

export interface IMultiDiffEditorLayoutDebugStateProvider {
	getLayoutDebugState(): IObservable<IMultiDiffEditorLayoutDebugState>;
}

export function isMultiDiffEditorLayoutDebugStateProvider(candidate: object | undefined): candidate is IMultiDiffEditorLayoutDebugStateProvider {
	return !!candidate && 'getLayoutDebugState' in candidate && typeof candidate.getLayoutDebugState === 'function';
}

export function createMultiDiffEditorLayoutDebugModel(
	state: IObservable<IMultiDiffEditorLayoutDebugState>,
	modelService: IModelService,
	languageService: ILanguageService,
): ITextModel {
	let previousState = state.get();
	const id = generateUuid();
	const logModel = modelService.createModel(
		`${JSON.stringify({ timestamp: Date.now(), set: previousState })}\n`,
		languageService.createById('jsonl'),
		URI.from({ scheme: Schemas.inMemory, path: `/multi-diff-editor-layout-${id}.jsonl` }),
	);
	const store = new DisposableStore();
	store.add(logModel.onWillDispose(() => store.dispose()));
	store.add(autorun(reader => {
		const nextState = state.read(reader);
		const operations = createJsonPatch(previousState, nextState);
		if (!logModel.isDisposed() && operations.length > 0) {
			appendJsonLines(logModel, [{ timestamp: Date.now(), patch: operations }]);
		}
		previousState = nextState;
	}));
	return logModel;
}

export function createJsonPatch(previous: JsonValue, next: JsonValue, path: JSONPath = []): JsonPatch {
	if (Object.is(previous, next)) {
		return [];
	}
	if (Array.isArray(previous) && Array.isArray(next)) {
		if (previous.length !== next.length) {
			return [{ op: 'replace', path: toJsonPointer(path), value: next }];
		}
		const operations: JsonPatchOperation[] = [];
		for (let index = 0; index < previous.length; index++) {
			appendJsonPatchOperations(operations, createJsonPatch(previous[index], next[index], [...path, index]));
		}
		return operations;
	}
	if (isJsonObject(previous) && isJsonObject(next)) {
		const operations: JsonPatchOperation[] = [];
		for (const key of Object.keys(previous)) {
			if (previous[key] !== undefined && next[key] === undefined) {
				operations.push({ op: 'remove', path: toJsonPointer([...path, key]) });
			}
		}
		for (const [key, value] of Object.entries(next)) {
			if (value === undefined) {
				continue;
			}
			const previousValue = previous[key];
			if (previousValue === undefined) {
				operations.push({ op: 'add', path: toJsonPointer([...path, key]), value });
			} else {
				appendJsonPatchOperations(operations, createJsonPatch(previousValue, value, [...path, key]));
			}
		}
		return operations;
	}
	return [{ op: 'replace', path: toJsonPointer(path), value: next }];
}

export function applyJsonPatchToText(text: string, patch: JsonPatch): string {
	forEachJsonPatchOperation(patch, operation => {
		text = applyEdits(text, setProperty(text, fromJsonPointer(operation.path, text), operation.op === 'remove' ? undefined : operation.value, {
			insertSpaces: false,
			tabSize: 4,
			eol: '\n',
		}));
	});
	return text;
}

function appendJsonPatchOperations(target: JsonPatchOperation[], patch: JsonPatch): void {
	forEachJsonPatchOperation(patch, operation => target.push(operation));
}

function forEachJsonPatchOperation(patch: JsonPatch, callback: (operation: JsonPatchOperation) => void): void {
	for (const entry of patch) {
		if (isJsonPatch(entry)) {
			forEachJsonPatchOperation(entry, callback);
		} else {
			callback(entry);
		}
	}
}

function isJsonPatch(value: JsonPatchOperation | JsonPatch): value is JsonPatch {
	return Array.isArray(value);
}

function appendJsonLines(model: ITextModel, values: readonly JsonValue[]): void {
	const end = model.getPositionAt(model.getValueLength());
	model.applyEdits([{
		range: { startLineNumber: end.lineNumber, startColumn: end.column, endLineNumber: end.lineNumber, endColumn: end.column },
		text: values.map(value => `${JSON.stringify(value)}\n`).join(''),
	}]);
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue | undefined } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonPointer(path: JSONPath): string {
	return path.map(segment => `/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

function fromJsonPointer(pointer: string, text: string): JSONPath {
	if (pointer === '') {
		return [];
	}
	const result: JSONPath = [];
	let value: JsonValue = JSON.parse(text);
	for (const encodedSegment of pointer.slice(1).split('/')) {
		const segment = encodedSegment.replaceAll('~1', '/').replaceAll('~0', '~');
		if (Array.isArray(value)) {
			const index = Number(segment);
			result.push(index);
			value = value[index];
		} else {
			result.push(segment);
			value = isJsonObject(value) ? value[segment] ?? null : null;
		}
	}
	return result;
}
