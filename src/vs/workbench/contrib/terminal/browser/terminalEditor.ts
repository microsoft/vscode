/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorInputSerializer, IEditorOpenContext } from 'vs/workbench/common/editor';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';


export class TerminalEditor extends EditorPane {

	public static readonly ID = 'terminalEditor';

	private _parentElement: HTMLElement | undefined;
	private _isAttached: boolean = false;
	private _editorInput!: TerminalEditorInput;


	override async setInput(newInput: TerminalEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this._editorInput = newInput;
		await super.setInput(newInput, options, context, token);
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected createEditor(parent: HTMLElement): void {
		this._parentElement = parent;
	}

	layout(dimension: Dimension): void {
		if (this._editorInput?.terminalInstance) {
			this._editorInput.terminalInstance.layout(dimension);
		}
	}

	override setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);

		if (!this._editorInput?.terminalInstance) {
			return;
		}

		if (!this._isAttached) {
			this._editorInput.terminalInstance.attachToElement(this._parentElement!);
			this._isAttached = true;
		}
		this._editorInput.terminalInstance.setVisible(visible);
	}

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {

		super(TerminalEditor.ID, telemetryService, themeService, storageService);
	}
}

export class TerminalInputSerializer implements IEditorInputSerializer {
	public canSerialize(editorInput: TerminalEditorInput): boolean {
		return false;
	}

	public serialize(editorInput: TerminalEditorInput): string {
		return '';
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TerminalEditorInput {
		throw new Error('NYI');
		// return TerminalEditorInput.copy(instantiationService);
	}
}
