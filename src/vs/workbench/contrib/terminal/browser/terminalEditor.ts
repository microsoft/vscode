/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorInputSerializer } from 'vs/workbench/common/editor';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';


export class TerminalEditor extends EditorPane {

	public static readonly ID = 'terminalEditor';

	private _instance: ITerminalInstance | undefined;
	private _parentElement: HTMLElement | undefined;
	private _isAttached: boolean = false;

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected createEditor(parent: HTMLElement): void {
		this._parentElement = parent;
		this._instance = this._terminalService.createInstance({});
	}

	layout(dimension: Dimension): void {
		if (this._instance) {
			this._instance.layout(dimension);
		}
	}

	override setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);

		if (!this._instance) {
			return;
		}

		if (!this._isAttached) {
			this._instance.attachToElement(this._parentElement!);
			this._isAttached = true;
		}
		this._instance.setVisible(visible);
	}

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ITerminalService private readonly _terminalService: ITerminalService
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
		try {
			return new TerminalEditorInput();
		} catch { }
		return new TerminalEditorInput();
	}
}
