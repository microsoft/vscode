/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, IDomPosition } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';

export interface IInteractiveSessionEditorOptions extends IEditorOptions {
	providerId: string;
}

export class InteractiveSessionEditor extends EditorPane {
	static readonly ID: string = 'workbench.editor.interactiveSession';
	static readonly SCHEME: string = 'interactiveSession';

	private static _counter = 0;
	static getNewEditorUri(): URI {
		return URI.from({ scheme: InteractiveSessionEditor.SCHEME, path: `interactiveSession-${InteractiveSessionEditor._counter++}` });
	}

	private widget: InteractiveSessionWidget | undefined;
	private parentElement: HTMLElement | undefined;
	private dimension: Dimension | undefined;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
	) {
		super(InteractiveSessionEditor.ID, telemetryService, themeService, storageService);
	}

	public async clear() {
		if (this.widget) {
			await this.widget.clear();
		}
	}

	protected override createEditor(parent: HTMLElement): void {
		this.parentElement = parent;
	}

	public override focus(): void {
		if (this.widget) {
			this.widget.focusInput();
		}
	}

	override async setInput(input: InteractiveSessionEditorInput, options: IInteractiveSessionEditorOptions, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		super.setInput(input, options, context, token);

		// TODO would be much cleaner if I can create the widget first and set its provider id later
		if (!this.widget) {
			this.widget = this.instantiationService.createInstance(InteractiveSessionWidget, options.providerId, undefined, () => editorBackground, () => SIDE_BAR_BACKGROUND, () => SIDE_BAR_BACKGROUND);
			if (!this.parentElement) {
				throw new Error('InteractiveSessionEditor lifecycle issue: Parent element not set');
			}

			this.widget.render(this.parentElement);
			this.widget.setVisible(true);

			if (this.dimension) {
				this.layout(this.dimension, undefined);
			}
		}
	}

	override layout(dimension: Dimension, position?: IDomPosition | undefined): void {
		if (this.widget) {
			this.widget.layout(dimension.height, dimension.width);
		}

		this.dimension = dimension;
	}
}

