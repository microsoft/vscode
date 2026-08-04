/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution } from '../browserEditor.js';

const BrowserAutoReloadOnFileChangeSettingId = 'workbench.browser.autoReloadOnFileChange';

class BrowserEditorAutoReloadContribution extends BrowserEditorContribution {
	constructor(
		editor: BrowserEditor,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(editor);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		const watcherStore = store.add(new MutableDisposable<DisposableStore>());

		const setup = () => {
			watcherStore.value = undefined;

			if (!this.configurationService.getValue<boolean>(BrowserAutoReloadOnFileChangeSettingId)) {
				return;
			}

			const uri = URI.parse(model.url);
			if (uri.scheme !== Schemas.file) {
				return;
			}

			const watchStore = new DisposableStore();
			const scheduler = watchStore.add(new RunOnceScheduler(() => { model.reload().catch(() => { }); }, 300));
			const watcher = watchStore.add(this.fileService.createWatcher(uri, { recursive: false, excludes: [] }));
			watchStore.add(watcher.onDidChange(e => {
				if (e.contains(uri, FileChangeType.UPDATED) || e.contains(uri, FileChangeType.ADDED)) {
					scheduler.schedule();
				}
			}));
			watcherStore.value = watchStore;
		};

		setup();
		store.add(model.onDidNavigate(() => setup()));
		store.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(BrowserAutoReloadOnFileChangeSettingId)) {
				setup();
			}
		}));
	}
}

BrowserEditor.registerContribution(BrowserEditorAutoReloadContribution);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserAutoReloadOnFileChangeSettingId]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.autoReloadOnFileChange' },
				'Automatically reload the Integrated Browser when the local file it is displaying changes on disk.'
			),
		}
	}
});
