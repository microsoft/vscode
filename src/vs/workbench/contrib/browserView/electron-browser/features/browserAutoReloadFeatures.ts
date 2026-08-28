/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BrowserEditor, BrowserEditorContribution } from '../browserEditor.js';

const BrowserAutoReloadOnFileChangeSettingId = 'workbench.browser.autoReloadOnFileChange';

function getFileUri(url: string): URI | undefined {
	if (!url) {
		return undefined;
	}

	const uri = URI.parse(url);
	return uri.scheme === Schemas.file ? uri.with({ query: null, fragment: null }) : undefined;
}

interface IBrowserAutoReloadStateChangeEvent {
	readonly browserId: string;
	readonly enabled: boolean;
}

const IBrowserAutoReloadService = createDecorator<IBrowserAutoReloadService>('browserAutoReloadService');

interface IBrowserAutoReloadService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeState: Event<IBrowserAutoReloadStateChangeEvent>;
	isEnabled(browserId: string): boolean;
	setEnabled(browserId: string, enabled: boolean): void;
}

export class BrowserAutoReloadWatcher extends Disposable {
	private readonly _watcher = this._register(new MutableDisposable<DisposableStore>());
	private readonly _modelListeners = this._register(new MutableDisposable<DisposableStore>());
	private _model: IBrowserViewModel | undefined;
	private _enabled: boolean;
	private _hasPendingChange = false;

	constructor(
		input: BrowserEditorInput,
		enabled: boolean,
		private readonly _fileService: IFileService,
	) {
		super();
		this._enabled = enabled;
		this._register(input.onceModelResolves(model => this._attachModel(model)));
	}

	setEnabled(enabled: boolean): void {
		if (this._enabled === enabled) {
			return;
		}

		this._enabled = enabled;
		this._hasPendingChange = false;
		this._updateWatcher();
	}

	private _attachModel(model: IBrowserViewModel): void {
		const listeners = new DisposableStore();
		this._modelListeners.value = listeners;
		this._model = model;
		listeners.add(model.onDidNavigate(() => {
			this._hasPendingChange = false;
			this._updateWatcher();
		}));
		listeners.add(model.onDidChangeVisibility(() => this._reloadPendingChange()));
		listeners.add(model.onWillDispose(() => {
			if (this._model === model) {
				this._model = undefined;
				this._hasPendingChange = false;
				this._watcher.clear();
			}
		}));
		this._updateWatcher();
	}

	private _updateWatcher(): void {
		this._watcher.clear();

		const model = this._model;
		if (!this._enabled || !model) {
			return;
		}

		const uri = getFileUri(model.url);
		if (!uri) {
			return;
		}

		const store = new DisposableStore();
		const scheduler = store.add(new RunOnceScheduler(() => {
			this._hasPendingChange = true;
			this._reloadPendingChange();
		}, 300));
		const watcher = store.add(this._fileService.createWatcher(uri, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(event => {
			if (event.contains(uri, FileChangeType.UPDATED) || event.contains(uri, FileChangeType.ADDED)) {
				scheduler.schedule();
			}
		}));
		this._watcher.value = store;
	}

	private _reloadPendingChange(): void {
		if (!this._enabled || !this._hasPendingChange || !this._model?.visible) {
			return;
		}

		this._hasPendingChange = false;
		this._model.reload().catch(onUnexpectedError);
	}
}

export class BrowserAutoReloadService extends Disposable implements IBrowserAutoReloadService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<IBrowserAutoReloadStateChangeEvent>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly _watchers = new Map<string, { readonly input: BrowserEditorInput; readonly watcher: BrowserAutoReloadWatcher }>();
	private readonly _overrides = new Map<string, boolean>();

	constructor(
		@IBrowserViewWorkbenchService private readonly _browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		this._register(this._browserViewWorkbenchService.onDidChangeBrowserViews(() => this._updateBrowserViews()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(BrowserAutoReloadOnFileChangeSettingId)) {
				this._updateDefault();
			}
		}));
		this._updateBrowserViews();
	}

	isEnabled(browserId: string): boolean {
		return this._overrides.get(browserId) ?? this._configurationService.getValue<boolean>(BrowserAutoReloadOnFileChangeSettingId);
	}

	setEnabled(browserId: string, enabled: boolean): void {
		if (this.isEnabled(browserId) === enabled) {
			return;
		}

		this._overrides.set(browserId, enabled);
		this._watchers.get(browserId)?.watcher.setEnabled(enabled);
		this._onDidChangeState.fire({ browserId, enabled });
	}

	private _updateBrowserViews(): void {
		const browserViews = this._browserViewWorkbenchService.getKnownBrowserViews();

		for (const [browserId, entry] of this._watchers) {
			const input = browserViews.get(browserId);
			if (input !== entry.input) {
				entry.watcher.dispose();
				this._watchers.delete(browserId);
				if (!input) {
					this._overrides.delete(browserId);
				}
			}
		}

		for (const [browserId, input] of browserViews) {
			if (!this._watchers.has(browserId)) {
				const watcher = new BrowserAutoReloadWatcher(input, this.isEnabled(browserId), this._fileService);
				this._watchers.set(browserId, { input, watcher });
			}
		}
	}

	private _updateDefault(): void {
		for (const [browserId, entry] of this._watchers) {
			if (!this._overrides.has(browserId)) {
				const enabled = this.isEnabled(browserId);
				entry.watcher.setEnabled(enabled);
				this._onDidChangeState.fire({ browserId, enabled });
			}
		}
	}

	override dispose(): void {
		for (const { watcher } of this._watchers.values()) {
			watcher.dispose();
		}
		this._watchers.clear();
		super.dispose();
	}
}

class BrowserAutoReloadWorkbenchContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.browserAutoReload';

	constructor(
		@IBrowserAutoReloadService _browserAutoReloadService: IBrowserAutoReloadService,
	) { }
}

class BrowserEditorAutoReloadContribution extends BrowserEditorContribution {
	private readonly _onDidChangeActionViewItems = this._register(new Emitter<void>());
	override readonly onDidChangeActionViewItems = this._onDidChangeActionViewItems.event;
	private readonly _actionViewItemsUpdateScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeActionViewItems.fire(), 0));
	private _model: IBrowserViewModel | undefined;

	constructor(
		editor: BrowserEditor,
		@IBrowserAutoReloadService private readonly _browserAutoReloadService: IBrowserAutoReloadService,
	) {
		super(editor);

		this._register(this._browserAutoReloadService.onDidChangeState(event => {
			if (event.browserId === this._model?.id) {
				this._actionViewItemsUpdateScheduler.schedule();
			}
		}));
	}

	get isLiveReloadEnabled(): boolean {
		return this.isFile && this._browserAutoReloadService.isEnabled(this._model!.id);
	}

	get isFile(): boolean {
		return !!this._model && !!getFileUri(this._model.url);
	}

	override getActionViewItem(action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService): IActionViewItem | undefined {
		if (action.id !== BrowserViewCommandId.Reload || !(action instanceof MenuItemAction) || !this.isFile) {
			return undefined;
		}

		const primaryAction = this.isLiveReloadEnabled
			? instantiationService.createInstance(
				MenuItemAction,
				{
					...action.item,
					icon: Codicon.sync,
					title: localize('browser.reloadAutomaticRefreshEnabled', "Reload (Automatic Refresh Enabled)"),
				},
				action.alt?.item,
				{ shouldForwardArgs: true },
				action.hideActions,
				action.menuKeybinding,
			)
			: action;

		return instantiationService.createInstance(
			DropdownWithPrimaryActionViewItem,
			primaryAction,
			toAction({
				id: 'workbench.browser.reloadMenu',
				label: localize('browser.reloadMenu', "More Reload Actions"),
				run: () => { },
			}),
			this._getLiveReloadMenuActions(),
			'',
			{ hoverDelegate: options.hoverDelegate }
		);
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._model = model;
		this._onDidChangeActionViewItems.fire();
		store.add(model.onDidNavigate(() => {
			this._onDidChangeActionViewItems.fire();
		}));
	}

	override onModelDetached(): void {
		this._model = undefined;
		this._onDidChangeActionViewItems.fire();
	}

	private _getLiveReloadMenuActions(): IAction[] {
		const contribution = this;
		const toggleAction: IAction = {
			id: 'workbench.browser.toggleAutoReload',
			label: localize('browser.refreshAutomatically', "Refresh Automatically"),
			tooltip: '',
			class: undefined,
			get enabled() { return contribution.isFile; },
			get checked() { return contribution.isLiveReloadEnabled; },
			run: () => {
				const model = this._model;
				if (model) {
					this._browserAutoReloadService.setEnabled(model.id, !this.isLiveReloadEnabled);
				}
			},
		};

		return [toggleAction];
	}
}

registerSingleton(IBrowserAutoReloadService, BrowserAutoReloadService, InstantiationType.Delayed);
registerWorkbenchContribution2(BrowserAutoReloadWorkbenchContribution.ID, BrowserAutoReloadWorkbenchContribution, WorkbenchPhase.AfterRestored);
BrowserEditor.registerContribution(BrowserEditorAutoReloadContribution);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserAutoReloadOnFileChangeSettingId]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				{ comment: ['This is the description for a setting.'], key: 'browser.autoReloadOnFileChange' },
				'Controls whether the Integrated Browser automatically reloads by default when displaying local `file://` resources that change on disk.'
			),
		}
	}
});
