/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataAutoSyncService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { VIEWLET_ID } from '../../extensions/common/extensions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { KeybindingsEditorInput } from '../../../services/preferences/browser/keybindingsEditorInput.js';
import { SettingsEditor2Input } from '../../../services/preferences/common/preferencesEditorInput.js';

export class UserDataSyncTrigger extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService editorService: IEditorService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IViewsService viewsService: IViewsService,
		@IUserDataAutoSyncService userDataAutoSyncService: IUserDataAutoSyncService,
		@IHostService hostService: IHostService,
	) {
		super();
		const event = Event.filter(
			Event.any<string | undefined>(
				Event.map(editorService.onDidActiveEditorChange, () => this.getUserDataEditorInputSource(editorService.activeEditor)),
				Event.map(Event.filter(viewsService.onDidChangeViewContainerVisibility, e => e.id === VIEWLET_ID && e.visible), e => e.id)
			), source => source !== undefined);
		if (isWeb) {
			this._register(Event.debounce<string, string[]>(
				Event.any<string>(
					Event.map(hostService.onDidChangeFocus, () => 'windowFocus'),
					Event.map(event, source => source!),
				), (last, source) => last ? [...last, source] : [source], 1000)
				(sources => userDataAutoSyncService.triggerSync(sources, true, false)));
		} else {
			this._register(event(source => userDataAutoSyncService.triggerSync([source!], true, false)));
		}
	}

	private getUserDataEditorInputSource(editorInput: EditorInput | undefined): string | undefined {
		if (!editorInput) {
			return undefined;
		}
		if (editorInput instanceof SettingsEditor2Input) {
			return 'settingsEditor';
		}
		if (editorInput instanceof KeybindingsEditorInput) {
			return 'keybindingsEditor';
		}
		const resource = editorInput.resource;
		if (isEqual(resource, this.userDataProfilesService.defaultProfile.settingsResource)) {
			return 'settingsEditor';
		}
		if (isEqual(resource, this.userDataProfilesService.defaultProfile.keybindingsResource)) {
			return 'keybindingsEditor';
		}
		return undefined;
	}
}
