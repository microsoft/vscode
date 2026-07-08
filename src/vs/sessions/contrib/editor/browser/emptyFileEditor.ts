/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emptyFileEditor.css';
import { $, addDisposableListener, Dimension, EventType } from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

const QUICK_OPEN_COMMAND_ID = 'workbench.action.quickOpen';

export class EmptyFileEditor extends EditorPane {

	static readonly ID = EmptyFileEditorInput.EDITOR_ID;

	private container: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(EmptyFileEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const keybindingLabel = this.keybindingService.lookupKeybinding(QUICK_OPEN_COMMAND_ID)?.getLabel()
			?? localize('emptyFileEditor.quickOpenFallback', "Quick Open");
		const placeholder = localize('emptyFileEditor.placeholder', "Select a file or search with {0}", keybindingLabel);

		this.container = $('div.empty-file-editor', {
			role: 'button',
			tabindex: 0,
			'aria-label': placeholder
		});

		const message = $('span.empty-file-editor-placeholder');
		message.textContent = placeholder;
		this.container.appendChild(message);
		parent.appendChild(this.container);

		// Support touch (iOS): register a gesture target so `Tap` fires, and handle
		// both click and tap to open the picker (see sessionTypePicker/sessionFilesWidget).
		this._register(Gesture.addTarget(this.container));
		for (const eventType of [EventType.CLICK, TouchEventType.Tap]) {
			this._register(addDisposableListener(this.container, eventType, () => this.openQuickOpen()));
		}
		this._register(addDisposableListener(this.container, EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.openQuickOpen();
			}
		}));
	}

	override focus(): void {
		this.container?.focus();
	}

	override layout(_dimension: Dimension): void { }

	private openQuickOpen(): void {
		void this.commandService.executeCommand(QUICK_OPEN_COMMAND_ID, '');
	}
}
