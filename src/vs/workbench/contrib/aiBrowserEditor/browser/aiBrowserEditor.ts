/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AiBrowserEditorInput } from './aiBrowserEditorInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { AiBrowserView } from './aiBrowserView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class AiBrowserEditor extends EditorPane {
	static readonly ID = 'workbench.editor.aiBrowser';

	private aiBrowserView?: AiBrowserView;
	private container?: HTMLElement;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(AiBrowserEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = parent;
		this.container.style.overflow = 'hidden';
	}

	override async setInput(input: AiBrowserEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (this.container && !this.aiBrowserView) {
			// Create the AI Browser view
			this.aiBrowserView = this._register(
				this.instantiationService.createInstance(AiBrowserView, {
					container: this.container
				})
			);
		}
	}

	override focus(): void {
		// Focus the AI Browser view if available
		if (this.aiBrowserView) {
			// The AiBrowserView doesn't have a public focus method, so we focus the container
			this.container?.focus();
		}
	}

	override layout(dimension: Dimension): void {
		// The AiBrowserView handles its own layout through CSS flexbox
		// No additional layout logic needed as it uses 100% width/height
	}

	override clearInput(): void {
		super.clearInput();
	}

	override dispose(): void {
		this.aiBrowserView = undefined;
		super.dispose();
	}
}
