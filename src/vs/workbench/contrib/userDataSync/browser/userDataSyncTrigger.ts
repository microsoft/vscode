/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { SettingsEditor2Input, KeybindingsEditorInput, PreferencesEditorInput } from 'vs/workbench/services/preferences/common/preferencesEditorInput';
import { isEqual } from 'vs/base/common/resources';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IViewlet } from 'vs/workbench/common/viewlet';

export class UserDataSyncTrigger extends Disposable {

	private readonly _onDidTriggerSync: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidTriggerSync: Event<string> = this._onDidTriggerSync.event;

	constructor(
		@IEditorService editorService: IEditorService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IViewletService viewletService: IViewletService,
	) {
		super();
		this._register(Event.any<string | undefined>(
			Event.map(editorService.onDidActiveEditorChange, () => this.getUserDataEditorInputSource(editorService.activeEditor)),
			Event.map(viewletService.onDidViewletOpen, viewlet => this.getUserDataViewletSource(viewlet))
		)(source => {
			if (source) {
				this._onDidTriggerSync.fire(source);
			}
		}));
	}

	private getUserDataViewletSource(viewlet: IViewlet): string | undefined {
		if (viewlet.getId() === VIEWLET_ID) {
			return 'extensionsViewlet';
		}
		return undefined;
	}

	private getUserDataEditorInputSource(editorInput: IEditorInput | undefined): string | undefined {
		if (!editorInput) {
			return undefined;
		}
		if (editorInput instanceof SettingsEditor2Input) {
			return 'settingsEditor';
		}
		if (editorInput instanceof PreferencesEditorInput) {
			return 'settingsEditor';
		}
		if (editorInput instanceof KeybindingsEditorInput) {
			return 'keybindingsEditor';
		}
		const resource = editorInput.resource;
		if (isEqual(resource, this.workbenchEnvironmentService.settingsResource)) {
			return 'settingsEditor';
		}
		if (isEqual(resource, this.workbenchEnvironmentService.keybindingsResource)) {
			return 'keybindingsEditor';
		}
		return undefined;
	}
}

