/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { overrideNowValue } from '../../../../platform/inlineEdits/common/utils/utils';
import { NesXtabHistoryTracker, XtabEditMergeStrategy } from '../../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { assert } from '../../../../util/vs/base/common/assert';
import { observableValue } from '../../../../util/vs/base/common/observable';
import * as path from '../../../../util/vs/base/common/path';
import { IRecordingInformation, ObservableWorkspaceRecordingReplayer } from '../../common/observableWorkspaceRecordingReplayer';


describe('NesXtabHistoryTracker', () => {

	afterEach(() => {
		overrideNowValue(-1);
	});

	function createTracker(replayerWorkspace: any, maxHistorySize?: number | undefined, mergeStrategy = XtabEditMergeStrategy.sameStartLine) {
		return new (class extends NesXtabHistoryTracker {
			protected override readonly mergeStrategy = observableValue(this, mergeStrategy);
		})(replayerWorkspace, maxHistorySize, new DefaultsOnlyConfigurationService(), new NullExperimentationService());
	}

	function historyToString(tracker: NesXtabHistoryTracker): string {
		const history = tracker.getHistory();
		assert(history.every(e => e.kind === 'edit'));
		return stripTrailingWhitespace(history.map(h => h.edit.toString()).join('\n---\n'));
	}

	/** Strip trailing whitespace from each line to avoid fragile snapshots. */
	function stripTrailingWhitespace(s: string): string {
		return s.replace(/[^\S\n]+$/gm, '');
	}

	it('1 line, 1 edit', () => {
		const recording: IRecordingInformation = {
			log: [
				{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
				{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
				{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'hemmo world\ngoodbye' },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[2, 4, 'll']] },
			]
		};
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace);
		replayer.replay();
		expect(historyToString(tracker)).toMatchInlineSnapshot(`
			"-   1     hemmo world
			+       1 hello world
			    2   2 goodbye"
		`);
	});

	it('1 line, 2 edits', () => {
		const recording: IRecordingInformation = {
			log: [
				{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
				{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
				{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'hemmo world\ngoodbye' },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[2, 4, 'll']] },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[8, 8, 'ooooo']] },
			]
		};
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace);
		replayer.replay();
		expect(historyToString(tracker)).toMatchInlineSnapshot(`
			"-   1     hemmo world
			+       1 hello woooooorld
			    2   2 goodbye"
		`);
	});

	it('handles simple history', () => {
		const recording: IRecordingInformation = {
			log: [
				{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
				{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
				{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'hemmo' },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[5, 5, '\n']] },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[2, 4, 'll']] },
				{ time: 11, id: 0, v: 1, kind: 'changed', edit: [[6, 6, 'world']] },
			]
		};
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace);
		replayer.replay();
		expect(historyToString(tracker)).toMatchInlineSnapshot(`
			"    1   1 hemmo
			+       2
			---
			-   1     hemmo
			+       1 hello
			    2   2
			---
			    1   1 hello
			-   2
			+       2 world"
		`);
	});

	it('handles simple history with small maxHistorySize', () => {
		const recording: IRecordingInformation = {
			log: [
				{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
				{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
				{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'hemmo' },
				{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[5, 5, '\n']] },
				{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[2, 4, 'll']] },
				{ time: 14, id: 0, v: 4, kind: 'changed', edit: [[6, 6, 'world']] },
				{ time: 15, id: 0, v: 5, kind: 'changed', edit: [[0, 5, 'goodbye']] },
			]
		};
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace, 2);
		replayer.replay();
		expect(historyToString(tracker)).toMatchInlineSnapshot(`
			"    1   1 hello
			-   2
			+       2 world
			---
			-   1     hello
			+       1 goodbye
			    2   2 world"
		`);
	});

	it('add new lines and edit one of them', async () => {
		const recording: IRecordingInformation = await fs.readFile(path.join(__dirname, 'recordings/ArrayToObject.recording.w.json'), 'utf8').then(JSON.parse);
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace);
		replayer.replay();
		expect(historyToString(tracker)).toMatchInlineSnapshot(`
			"  147 147 			commandsWithArgs.set(commandId, argumentsSchema);
			  148 148 		}
			+     149
			+     150
			  149 151
			  150 152 		const searchableCommands: Searchables<Command>[] = [];
			  151 153
			---
			  148 148 		}
			  149 149
			- 150
			+     150 		function findVscodeDiff(schema: any, path: string[] = []): void {
			  151 151
			  152 152 		const searchableCommands: Searchables<Command>[] = [];
			  153 153
			---
			  149 149
			  150 150 		function findVscodeDiff(schema: any, path: string[] = []): void {
			+     151 			if (typeof schema === 'object' && schema !== null) {
			+     152 				for (const key in schema) {
			+     153 					if (schema[key] === 'vscode.diff') {
			+     154 						console.log(\`Found "vscode.diff" at path: \${path.concat(key).join('.')}\`);
			+     155 					} else {
			+     156 						findVscodeDiff(schema[key], path.concat(key));
			+     157 					}
			+     158 				}
			+     159 			}
			+     160 		}
			+     161
			+     162 		findVscodeDiff(keybindingsSchema);
			  151 163
			  152 164 		const searchableCommands: Searchables<Command>[] = [];
			  153 165
			---
			  147 147 			commandsWithArgs.set(commandId, argumentsSchema);
			  148 148 		}
			- 149
			- 150     		function findVscodeDiff(schema: any, path: string[] = []): void {
			- 151     			if (typeof schema === 'object' && schema !== null) {
			- 152     				for (const key in schema) {
			- 153     					if (schema[key] === 'vscode.diff') {
			- 154     						console.log(\`Found "vscode.diff" at path: \${path.concat(key).join('.')}\`);
			- 155     					} else {
			- 156     						findVscodeDiff(schema[key], path.concat(key));
			- 157     					}
			- 158     				}
			- 159     			}
			- 160     		}
			- 161
			- 162     		findVscodeDiff(keybindingsSchema);
			  163 149
			  164 150 		const searchableCommands: Searchables<Command>[] = [];
			  165 151
			---
			   25  25 }
			   26  26
			+      27 export interface Searchables
			+      28
			   27  29 export class Configurations implements vscode.Disposable {
			   28  30
			   29  31 	private readonly miniSearch: MiniSearch<Searchables<Setting | Command>>;
			---
			   24  24 	when?: string;
			   25  25 }
			-  26
			-  27     export interface Searchables
			   28  26
			   29  27 export class Configurations implements vscode.Disposable {
			   30  28
			---
			   18  18    }
			   19  19
			-  20        private validateSettings(settings: IStringDictionary<any>): [string, any][] {
			+      20    private validateSettings(settings: IStringDictionary<any>): {key: string, value:any}[] {
			   21  21       const result: [string, any][] = [];
			   22  22       for (const [key, value] of Object.entries(settings)) {
			   23  23          result.push([key, value]);"
		`);
	});

	it('doesnt throw with empty line edit', async () => {
		const recording: IRecordingInformation = await fs.readFile(path.join(__dirname, 'recordings/DeclaringConstructorArgument.recording.w.json'), 'utf8').then(JSON.parse);
		const replayer = new ObservableWorkspaceRecordingReplayer(recording);
		const tracker = createTracker(replayer.workspace);
		replayer.replay();
		const history = tracker.getHistory();
		assert(history.every(e => e.kind === 'edit'));
		expect(stripTrailingWhitespace(history.map(h => `${h.docId.path}\n---\n${h.edit.toString()}`).join('\n--------------\n'))).toMatchInlineSnapshot(`
			"/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   36  36 }
			   37  37
			+      38 class FifoQueue<T> {
			+      39
			+      40 }
			+      41
			   38  42 class DocumentState {
			   39  43 	private baseValue: StringValue;
			   40  44 	private currentValue: StringValue;
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   37  37
			   38  38 class FifoQueue<T> {
			-  39
			+      39 	constructor(
			+      40 		public readonly size: number
			+      41 	)
			   40  42 }
			   41  43
			   42  44 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   39  39 	constructor(
			   40  40 		public readonly size: number
			-  41     	)
			+      41 	) {
			+      42
			+      43 	}
			   42  44 }
			   43  45
			   44  46 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   40  40 		public readonly size: number
			   41  41 	) {
			-  42
			   43  42 	}
			   44  43 }
			   45  44
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   41  41 	) {
			   42  42 	}
			+      43
			+      44
			   43  45 }
			   44  46
			   45  47 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   38  38 class FifoQueue<T> {
			   39  39 	constructor(
			-  40     		public readonly size: number
			+      40 		public readonly maxSize: number
			   41  41 	) {
			   42  42 	}
			   43  43
			-  44
			+      44
			   45  45 }
			   46  46
			   47  47 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   41  41 	) {
			   42  42 	}
			-  43
			+      43
			   44  44
			   45  45 }
			   46  46
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   37  37
			   38  38 class FifoQueue<T> {
			+      39 	private _arr: T[] = [];
			   39  40 	constructor(
			   40  41 		public readonly maxSize: number
			   41  42 	) {
			   42  43 	}
			-  43
			+      44
			   44  45
			   45  46 }
			   46  47
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   38  38 class FifoQueue<T> {
			   39  39 	private _arr: T[] = [];
			+      40
			   40  41 	constructor(
			   41  42 		public readonly maxSize: number
			   42  43 	) {
			   43  44 	}
			   44  45
			-  45
			+      46
			   46  47 }
			   47  48
			   48  49 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   44  44 	}
			   45  45
			-  46
			+      46 	push(e: T): void {
			+      47 		this._arr.push(e);
			+      48 		if (this._arr.length > this.maxSize) {
			+      49 			this._arr.shift();
			+      50 		}
			+      51 	}
			   47  52 }
			   48  53
			   49  54 class DocumentState {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   15  15 export class NesWorkspaceEditTracker implements IWorkspaceEditTracker {
			   16  16 	private readonly _documentState = new Map<DocumentUri, DocumentState>();
			+      17 	private readonly _lastDocuments = new FifoQueue<DocumentUri>(5);
			   17  18
			   18  19 	public handleDocumentOpened(docUri: DocumentUri, state: StringValue): void {
			   19  20 		this._documentState.set(docUri, new DocumentState(state.value));
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   23  23 	public handleEdit(docUri: DocumentUri, edit: Edit): void {
			   24  24 		const state = this._documentState.get(docUri)!;
			+      25 		this._lastDocuments.push()
			   25  26 		state.handleEdit(edit);
			   26  27 	}
			   27  28
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   15  15 export class NesWorkspaceEditTracker implements IWorkspaceEditTracker {
			   16  16 	private readonly _documentState = new Map<DocumentUri, DocumentState>();
			-  17     	private readonly _lastDocuments = new FifoQueue<DocumentUri>(5);
			+      17 	private readonly _lastDocuments = new FifoSet<DocumentState>(5);
			   18  18
			   19  19 	public handleDocumentOpened(docUri: DocumentUri, state: StringValue): void {
			   20  20 		this._documentState.set(docUri, new DocumentState(state.value));
			---
			   38  38 }
			   39  39
			-  40     class FifoQueue<T> {
			+      40 class FifoSet<T> {
			   41  41 	private _arr: T[] = [];
			   42  42
			   43  43 	constructor(
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   47  47
			   48  48 	push(e: T): void {
			-  49     		this._arr.push(e);
			-  50     		if (this._arr.length > this.maxSize) {
			-  51     			this._arr.shift();
			-  52     		}
			+      49
			   53  50 	}
			   54  51 }
			   55  52
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---

			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   47  47
			   48  48 	push(e: T): void {
			-  49
			+      49 		const existing = this._arr.indexOf(e);
			+      50
			   50  51 	}
			   51  52 }
			   52  53
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   48  48 	push(e: T): void {
			   49  49 		const existing = this._arr.indexOf(e);
			-  50
			+      50 		if (existing !== -1) {
			+      51 			this._arr.splice(existing, 1);
			+      52 		} else if (this._arr.length >= this.maxSize) {
			+      53 			this._arr.shift();
			+      54 		}
			   51  55 	}
			   52  56 }
			   53  57
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   50  50 		if (existing !== -1) {
			   51  51 			this._arr.splice(existing, 1);
			+      52
			   52  53 		} else if (this._arr.length >= this.maxSize) {
			   53  54 			this._arr.shift();
			   54  55 		}
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   54  54 			this._arr.shift();
			   55  55 		}
			+      56 		this._arr.push(e);
			   56  57 	}
			   57  58 }
			   58  59
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   50  50 		if (existing !== -1) {
			   51  51 			this._arr.splice(existing, 1);
			-  52
			   53  52 		} else if (this._arr.length >= this.maxSize) {
			   54  53 			this._arr.shift();
			   55  54 		}
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   23  23 	public handleEdit(docUri: DocumentUri, edit: Edit): void {
			   24  24 		const state = this._documentState.get(docUri)!;
			-  25     		this._lastDocuments.push()
			+      25 		this._lastDocuments.push(state);
			   26  26 		state.handleEdit(edit);
			   27  27 	}
			   28  28
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   86  86 	}
			   87  87
			-  88     	getRecentEdit(): RecentWorkspaceEdits | undefined {
			+      88 	getRecentEdit(editCount: number): RecentWorkspaceEdits | undefined {
			   89  89 		this._applyStaleEdits();
			   90  90
			   91  91 		if (this.edits.length === 0) { return undefined; }
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   87  87
			   88  88 	getRecentEdit(editCount: number): RecentWorkspaceEdits | undefined {
			-  89     		this._applyStaleEdits();
			+      89 		this._applyStaleEdits(editCount);
			   90  90
			   91  91 		if (this.edits.length === 0) { return undefined; }
			   92  92
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   86  86 	}
			   87  87
			-  88     	getRecentEdit(editCount: number): RecentWorkspaceEdits | undefined {
			+      88 	getRecentEdit(editCount: number): { edits: RecentWorkspaceEdits; editCount: number } | undefined {
			   89  89 		this._applyStaleEdits(editCount);
			   90  90
			   91  91 		if (this.edits.length === 0) { return undefined; }
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   99  99 	}
			  100 100
			- 101     	private _applyStaleEdits(): void {
			+     101 	private _applyStaleEdits(editCount: number): void {
			  102 102 		let recentEdit = Edit.empty;
			  103 103 		let i: number;
			  104 104 		let count = 0;
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			  103 103 		let i: number;
			  104 104 		let count = 0;
			- 105     		for (i = this.edits.length - 1; i >= 0 && count < 5; i--, count++) {
			+     105 		for (i = this.edits.length - 1; i >= 0 && count < editCount; i--, count++) {
			  106 106 			const e = this.edits[i];
			  107 107
			  108 108 			if (now() - e.instant > 10 * 60 * 1000) { break; }
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   96  96
			   97  97 		const result = new RootedEdit(this.baseValue, composedEdits);
			-  98     		return new RecentWorkspaceEdits(result, recentEditRange!);
			+      98 		return {
			+      99 			edits: new RecentWorkspaceEdits(result, recentEditRange!) };
			   99 100 	}
			  100 101
			  101 102 	private _applyStaleEdits(editCount: number): void {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   97  97 		const result = new RootedEdit(this.baseValue, composedEdits);
			   98  98 		return {
			-  99     			edits: new RecentWorkspaceEdits(result, recentEditRange!) };
			+      99 			edits: new RecentDocumentEdit(result, recentEditRange!),
			+     100 			editCount: this.edits.length,
			+     101 		};
			  100 102 	}
			  101 103
			  102 104 	private _applyStaleEdits(editCount: number): void {
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   11  11 import { TextLengthEdit } from '../dataTypes/textEditLength';
			   12  12 import { Instant, now } from '../utils/utils';
			-  13     import { IWorkspaceEditTracker, RecentWorkspaceEdits } from './workspaceEditTracker';
			+      13 import { IWorkspaceEditTracker, RecentDocumentEdit, RecentWorkspaceEdits } from './workspaceEditTracker';
			   14  14
			   15  15 export class NesWorkspaceEditTracker implements IWorkspaceEditTracker {
			   16  16 	private readonly _documentState = new Map<DocumentUri, DocumentState>();
			--------------
			/c:/code/src/platform/inlineEdits/common/workspaceEditTracker/nesWorkspaceEditTracker.ts
			---
			   97  97 		const result = new RootedEdit(this.baseValue, composedEdits);
			   98  98 		return {
			-  99     			edits: new RecentDocumentEdit(result, recentEditRange!),
			+      99 			edits: new RecentDocumentEdit(this.docUri, result, recentEditRange!),
			  100 100 			editCount: this.edits.length,
			  101 101 		};
			  102 102 	}"
		`);
	});

	describe('proximity strategy', () => {

		/**
		 * Content layout (5 lines):
		 * line 1: "aaa"
		 * line 2: "bbb"
		 * line 3: "ccc"
		 * line 4: "ddd"
		 * line 5: "eee"
		 *
		 * Edit on line 1, then edit on line 2 — 0 lines apart → should merge with lineGap=1
		 */
		it('merges edits within lineGap', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					// Replace line 1: "aaa" → "AAA" (offset 0-3)
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					// Replace line 2: "bbb" → "BBB" (offset 4-7, after "AAA\n")
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[4, 7, 'BBB']] },
				]
			};
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.proximity(1));
			replayer.replay();

			// Should produce 1 merged entry (adjacent lines, gap=0 ≤ 1)
			expect(tracker.getHistory().length).toBe(1);
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				-   2     bbb
				+       2 BBB
				    3   3 ccc
				    4   4 ddd
				    5   5 eee"
			`);
		});

		/**
		 * Edit on line 1, then edit on line 5 — 3 lines apart → should NOT merge with lineGap=1
		 */
		it('does not merge edits beyond lineGap', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					// Replace line 1: "aaa" → "AAA" (offset 0-3)
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					// Replace line 5: "eee" → "EEE" (offset 16-19, after "AAA\nbbb\nccc\nddd\n")
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[16, 19, 'EEE']] },
				]
			};
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.proximity(1));
			replayer.replay();

			// Should produce 2 separate entries (distance = 3 > 1)
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				    2   2 bbb
				    3   3 ccc
				    4   4 ddd
				---
				    3   3 ccc
				    4   4 ddd
				-   5     eee
				+       5 EEE"
			`);
		});

		/**
		 * Edit on line 1, then edit on line 3 with lineGap=2 → distance=1, should merge
		 */
		it('merges edits exactly at lineGap boundary', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					// Replace line 1
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					// Replace line 3 (offset 8-11, after "AAA\nbbb\n")
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[8, 11, 'CCC']] },
				]
			};
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.proximity(2));
			replayer.replay();

			// distance between line 1 and line 3 is 1 (one line apart), which is ≤ 2
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				    2   2 bbb
				-   3     ccc
				+       3 CCC
				    4   4 ddd
				    5   5 eee"
			`);
		});

		/** lineGap=0 merges only when edits are on the same line (or touching lines) */
		it('lineGap=0 does not merge edits on non-adjacent lines', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc' },
					// Replace on line 1
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					// Replace on line 3 (offset 8-11)
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[8, 11, 'CCC']] },
				]
			};
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.proximity(0));
			replayer.replay();

			// distance=1 > 0 → should NOT merge
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				    2   2 bbb
				    3   3 ccc
				---
				    1   1 AAA
				    2   2 bbb
				-   3     ccc
				+       3 CCC"
			`);
		});
	});

	describe('hybrid strategy', () => {

		/**
		 * Two rapid edits on adjacent lines → should merge
		 */
		it('merges rapid edits in same region', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[4, 7, 'BBB']] },
				]
			};

			overrideNowValue(1000);
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.hybrid(1, 2000));
			replayer.replay();

			// Both edits arrive at the same overridden time, within splitAfterMs and within lineGap → merge
			expect(tracker.getHistory().length).toBe(1);
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				-   2     bbb
				+       2 BBB
				    3   3 ccc
				    4   4 ddd
				    5   5 eee"
			`);
		});

		/**
		 * Same region but long pause between edits → should split
		 */
		it('splits edits separated by long pause', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[4, 7, 'BBB']] },
				]
			};

			overrideNowValue(1000);
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.hybrid(1, 500));

			// Replay header + document + setContent
			replayer.step(); // header
			replayer.step(); // documentEncountered
			replayer.step(); // setContent

			// First edit at time 1000
			overrideNowValue(1000);
			replayer.step(); // changed: AAA

			// Second edit at time 2000, 1000ms later > 500ms splitAfterMs
			overrideNowValue(2000);
			replayer.step(); // changed: BBB

			// Should produce 2 separate entries
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				    2   2 bbb
				    3   3 ccc
				    4   4 ddd
				---
				    1   1 AAA
				-   2     bbb
				+       2 BBB
				    3   3 ccc
				    4   4 ddd
				    5   5 eee"
			`);
		});

		/**
		 * Rapid edits but far apart → should split due to distance despite being rapid
		 */
		it('splits rapid edits that are far apart', () => {
			overrideNowValue(1000);

			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc\nddd\neee' },
					// Line 1 edit
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 3, 'AAA']] },
					// Line 5 edit (offset 16-19, distance=3 > lineGap=1)
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[16, 19, 'EEE']] },
				]
			};
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.hybrid(1, 5000));
			replayer.replay();

			// Even though both are rapid (same overrideNowValue), distance=3 > lineGap=1 → split
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAA
				    2   2 bbb
				    3   3 ccc
				    4   4 ddd
				---
				    3   3 ccc
				    4   4 ddd
				-   5     eee
				+       5 EEE"
			`);
		});

		/**
		 * Three edit bursts: rapid-on-same-line, pause, rapid-on-same-line → 2 entries
		 */
		it('creates separate entries per logical burst', () => {
			const recording: IRecordingInformation = {
				log: [
					{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///Users/john/myProject', time: 0, uuid: '' },
					{ time: 10, id: 0, kind: 'documentEncountered', relativePath: 'src/a.ts' },
					{ time: 11, id: 0, v: 1, kind: 'setContent', content: 'aaa\nbbb\nccc' },
					// Burst 1: two rapid edits on line 1
					{ time: 12, id: 0, v: 2, kind: 'changed', edit: [[0, 1, 'A']] },
					{ time: 13, id: 0, v: 3, kind: 'changed', edit: [[1, 2, 'A']] },
					// Burst 2: edit on line 1 again, after pause
					{ time: 14, id: 0, v: 4, kind: 'changed', edit: [[2, 3, 'A']] },
				]
			};

			overrideNowValue(1000);
			const replayer = new ObservableWorkspaceRecordingReplayer(recording);
			const tracker = createTracker(replayer.workspace, undefined, XtabEditMergeStrategy.hybrid(1, 500));

			// Replay header + document + setContent
			replayer.step(); // header
			replayer.step(); // documentEncountered
			replayer.step(); // setContent

			// Burst 1
			overrideNowValue(1000);
			replayer.step(); // edit 1
			overrideNowValue(1100);
			replayer.step(); // edit 2

			// Pause...
			// Burst 2
			overrideNowValue(5000);
			replayer.step(); // edit 3

			// Burst 1 merged into 1 entry, burst 2 is separate → 2 entries
			expect(historyToString(tracker)).toMatchInlineSnapshot(`
				"-   1     aaa
				+       1 AAa
				    2   2 bbb
				    3   3 ccc
				---
				-   1     AAa
				+       1 AAA
				    2   2 bbb
				    3   3 ccc"
			`);
		});
	});
});
