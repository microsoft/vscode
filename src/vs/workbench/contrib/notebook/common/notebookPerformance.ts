/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PerfName = 'startTime' | 'extensionActivated' | 'inputLoaded' | 'webviewCommLoaded' | 'customMarkdownLoaded' | 'editorLoaded';

type PerformanceMark = { [key in PerfName]?: number };

export class NotebookPerfMarks {
	private _marks: PerformanceMark = {};

	get value(): PerformanceMark {
		return { ...this._marks };
	}

	mark(name: PerfName): void {
		if (this._marks[name]) {
			console.error(`Skipping overwrite of notebook perf value: ${name}`);
			return;
		}

		this._marks[name] = Date.now();
	}
}
