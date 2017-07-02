/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import URI from 'vs/base/common/uri';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope } from 'vs/workbench/common/memento';

export interface HtmlPreviewEditorViewState {
	scrollYPercentage: number;
}

interface HtmlPreviewEditorViewStates {
	0?: HtmlPreviewEditorViewState;
	1?: HtmlPreviewEditorViewState;
	2?: HtmlPreviewEditorViewState;
}

/**
 * This class is only intended to be subclassed and not instantiated.
 */
export abstract class BaseWebviewEditor extends BaseEditor {

	constructor(
		id: string,
		telemetryService: ITelemetryService,
		themeService: IThemeService,
		private storageService: IStorageService
	) {
		super(id, telemetryService, themeService);
	}

	private get viewStateStorageKey(): string {
		return this.getId() + '.editorViewState';
	}

	protected saveViewState(resource: URI | string, editorViewState: HtmlPreviewEditorViewState): void {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		let editorViewStateMemento = memento[this.viewStateStorageKey];
		if (!editorViewStateMemento) {
			editorViewStateMemento = Object.create(null);
			memento[this.viewStateStorageKey] = editorViewStateMemento;
		}

		let fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
		if (!fileViewState) {
			fileViewState = Object.create(null);
			editorViewStateMemento[resource.toString()] = fileViewState;
		}

		if (typeof this.position === 'number') {
			fileViewState[this.position] = editorViewState;
		}
	}

	protected loadViewState(resource: URI | string): HtmlPreviewEditorViewState | null {
		const memento = this.getMemento(this.storageService, Scope.WORKSPACE);
		const editorViewStateMemento = memento[this.viewStateStorageKey];
		if (editorViewStateMemento) {
			const fileViewState: HtmlPreviewEditorViewStates = editorViewStateMemento[resource.toString()];
			if (fileViewState) {
				return fileViewState[this.position];
			}
		}
		return null;
	}
}