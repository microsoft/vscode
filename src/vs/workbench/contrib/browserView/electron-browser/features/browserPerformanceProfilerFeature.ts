/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { RawContextKey, IContextKey, IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory } from '../browserViewActions.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

const CONTEXT_BROWSER_PROFILING = new RawContextKey<boolean>('browserProfiling', false, localize('browser.profiling', "Whether performance profiling is active for the current browser view"));

class BrowserEditorProfilingContribution extends BrowserEditorContribution {
	private readonly _profilingContext: IContextKey<boolean>;

	constructor(
		editor: BrowserEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(editor);
		this._profilingContext = CONTEXT_BROWSER_PROFILING.bindTo(contextKeyService);
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._profilingContext.set(model.isProfiling);
		store.add(model.onDidChangeProfilingState(e => {
			this._profilingContext.set(e.isProfiling);
		}));
	}

	override clear(): void {
		this._profilingContext.reset();
	}
}

BrowserEditor.registerContribution(BrowserEditorProfilingContribution);

class ToggleProfilerAction extends Action2 {
	static readonly ID = BrowserViewCommandId.ToggleProfiler;

	constructor() {
		super({
			id: ToggleProfilerAction.ID,
			title: localize2('browser.toggleProfilerAction', 'Toggle Performance Profiler'),
			category: BrowserActionCategory,
			icon: Codicon.record,
			f1: true,
			toggled: ContextKeyExpr.equals(CONTEXT_BROWSER_PROFILING.key, true),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: 'actions',
				order: 4,
			}
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}

		const model = browserEditor.model;
		if (!model) {
			return;
		}

		if (model.isProfiling) {
			const profileJson = await browserEditor.stopProfiling();
			if (profileJson) {
				const fileDialogService = accessor.get(IFileDialogService);
				const fileService = accessor.get(IFileService);
				const notificationService = accessor.get(INotificationService);

				const defaultUri = await fileDialogService.defaultFilePath();
				const uri = await fileDialogService.showSaveDialog({
					defaultUri: URI.joinPath(defaultUri, `profile-${Date.now()}.cpuprofile`),
					filters: [{ name: localize('browser.cpuProfileFilter', "CPU Profile"), extensions: ['cpuprofile'] }],
					title: localize('browser.saveProfile', "Save CPU Profile")
				});

				if (uri) {
					await fileService.writeFile(uri, VSBuffer.fromString(profileJson));
					notificationService.info(localize('browser.profileSaved', "CPU profile saved to {0}", uri.fsPath));
				}
			}
		} else {
			await browserEditor.startProfiling();
		}
	}
}

registerAction2(ToggleProfilerAction);
