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

	private readonly _onDidTriggerSync: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidTriggerSync: Event<void> = this._onDidTriggerSync.event;

	constructor(
		@IEditorService editorService: IEditorService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IViewletService viewletService: IViewletService,
	) {
		super();
		this._register(Event.debounce(Event.any<any>(
			Event.filter(editorService.onDidActiveEditorChange, () => this.isUserDataEditorInput(editorService.activeEditor)),
			Event.filter(viewletService.onDidViewletOpen, viewlet => this.isUserDataViewlet(viewlet))
		), () => undefined, 500)(() => this._onDidTriggerSync.fire()));
	}

	private isUserDataViewlet(viewlet: IViewlet): boolean {
		return viewlet.getId() === VIEWLET_ID;
	}

	private isUserDataEditorInput(editorInput: IEditorInput | undefined): boolean {
		if (!editorInput) {
			return false;
		}
		if (editorInput instanceof SettingsEditor2Input) {
			return true;
		}
		if (editorInput instanceof PreferencesEditorInput) {
			return true;
		}
		if (editorInput instanceof KeybindingsEditorInput) {
			return true;
		}
		const resource = editorInput.getResource();
		if (isEqual(resource, this.workbenchEnvironmentService.settingsResource)) {
			return true;
		}
		if (isEqual(resource, this.workbenchEnvironmentService.keybindingsResource)) {
			return true;
		}
		return false;
	}
}

