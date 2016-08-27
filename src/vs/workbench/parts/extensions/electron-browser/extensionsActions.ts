/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import severity from 'vs/base/common/severity';
import Event from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, VIEWLET_ID, IExtensionsViewlet } from './extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, LaterAction } from 'vs/platform/message/common/message';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Query } from '../common/extensionQuery';

export class InstallAction extends Action {

	private static InstallLabel = localize('installAction', "Install");
	private static InstallingLabel = localize('installing', "Installing");
	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.install', InstallAction.InstallLabel, 'extension-action install', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.label = InstallAction.InstallLabel;
			return;
		}

		this.enabled = this.extensionsWorkbenchService.canInstall(this.extension) && this.extension.state === ExtensionState.Uninstalled;
		this.label = this.extension.state === ExtensionState.Installing ? InstallAction.InstallingLabel : InstallAction.InstallLabel;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UninstallAction extends Action {

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super('extensions.uninstall', localize('uninstall', "Uninstall"), 'extension-action uninstall', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.Installed
			|| this.extension.state === ExtensionState.NeedsRestart;
	}

	run(): TPromise<any> {
		if (!window.confirm(localize('deleteSure', "Are you sure you want to uninstall '{0}'?", this.extension.displayName))) {
			return TPromise.as(null);
		}

		return this.extensionsWorkbenchService.uninstall(this.extension).then(() => {
			this.messageService.show(severity.Info, {
				message: localize('postUninstallMessage', "{0} was successfully uninstalled. Restart to deactivate it.", this.extension.displayName),
				actions: [LaterAction, this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, localize('restartNow', "Restart Now"))]
			});
		});
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CombinedInstallAction extends Action {

	private static NoExtensionClass = 'extension-action install no-extension';
	private installAction: InstallAction;
	private uninstallAction: UninstallAction;
	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) {
		this._extension = extension;
		this.installAction.extension = extension;
		this.uninstallAction.extension = extension;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.combinedInstall', '', '', false);

		this.installAction = instantiationService.createInstance(InstallAction);
		this.uninstallAction = instantiationService.createInstance(UninstallAction);
		this.disposables.push(this.installAction, this.uninstallAction);

		this.installAction.onDidChange(this.update, this, this.disposables);
		this.uninstallAction.onDidChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = CombinedInstallAction.NoExtensionClass;
		} else if (this.installAction.enabled) {
			this.enabled = true;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else if (this.uninstallAction.enabled) {
			this.enabled = true;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
		} else if (this.extension.state === ExtensionState.Installing) {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		}
	}

	run(): TPromise<any> {
		if (this.installAction.enabled) {
			return this.installAction.run();
		} else if (this.uninstallAction.enabled) {
			return this.uninstallAction.run();
		}

		return TPromise.as(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UpdateAction extends Action {

	private static EnabledClass = 'extension-action update';
	private static DisabledClass = `${ UpdateAction.EnabledClass } disabled`;

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.update', localize('updateAction', "Update"), UpdateAction.DisabledClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = UpdateAction.DisabledClass;
			return;
		}

		const canInstall = this.extensionsWorkbenchService.canInstall(this.extension);
		const isInstalled = this.extension.state === ExtensionState.Installed
			|| this.extension.state === ExtensionState.NeedsRestart;

		this.enabled = canInstall && isInstalled && this.extension.outdated;
		this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAction extends Action {

	private static EnabledClass = 'extension-action enable';
	private static DisabledClass = `${ EnableAction.EnabledClass } disabled`;

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super('extensions.enable', localize('enableAction', "Enable"), EnableAction.DisabledClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = EnableAction.DisabledClass;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.NeedsRestart;
		this.class = this.enabled ? EnableAction.EnabledClass : EnableAction.DisabledClass;
	}

	run(): TPromise<any> {
		if (!window.confirm(localize('restart', "In order to enable this extension, this window of VS Code needs to be restarted.\n\nDo you want to continue?"))) {
			return TPromise.as(null);
		}

		const action = this.instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, localize('restartNow', "Restart Now"));
		return action.run();
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UpdateAllAction extends Action {

	private disposables: IDisposable[] = [];

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.update-all', localize('updateAll', "Update All Extensions"), '', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private get outdated(): IExtension[] {
		return this.extensionsWorkbenchService.local
			.filter(e => this.extensionsWorkbenchService.canInstall(e)
				&& (e.state === ExtensionState.Installed || e.state === ExtensionState.NeedsRestart)
				&& e.outdated);
	}

	private update(): void {
		this.enabled = this.outdated.length > 0;
	}

	run(): TPromise<any> {
		return TPromise.join(this.outdated.map(e => this.extensionsWorkbenchService.install(e)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class OpenExtensionsViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleExtensionsViewlet', "Show Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

export class InstallExtensionsAction extends OpenExtensionsViewletAction {
	static ID = 'workbench.extensions.action.installExtensions';
	static LABEL = localize('installExtensions', "Install Extensions");
}

export class ShowInstalledExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showInstalledExtensions';
	static LABEL = localize('showInstalledExtensions', "Show Installed Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, 'clear-extensions', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('');
				viewlet.focus();
			});
	}
}

export class ClearExtensionsInputAction extends ShowInstalledExtensionsAction {

	static ID = 'workbench.extensions.action.clearExtensionsInput';
	static LABEL = localize('clearExtensionsInput', "Clear Extensions Input");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		@IViewletService viewletService: IViewletService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, viewletService, extensionsWorkbenchService);
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		this.enabled = !!value;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class ShowOutdatedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listOutdatedExtensions';
	static LABEL = localize('showOutdatedExtensions', "Show Outdated Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {

		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@outdated');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowPopularExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showPopularExtensions';
	static LABEL = localize('showPopularExtensions', "Show Popular Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowRecommendedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showRecommendedExtensions';
	static LABEL = localize('showRecommendedExtensions', "Show Recommended Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ChangeSortAction extends Action {

	private query: Query;
	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		private sortBy: string,
		private sortOrder: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);

		if (this.sortBy === undefined && this.sortOrder === undefined) {
			throw new Error('bad arguments');
		}

		this.query = Query.parse('');
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		const query = Query.parse(value);
		this.query = new Query(query.value, this.sortBy || query.sortBy, this.sortOrder || query.sortOrder);
		this.enabled = this.query.isValid() && !this.query.equals(query);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search(this.query.toString());
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}