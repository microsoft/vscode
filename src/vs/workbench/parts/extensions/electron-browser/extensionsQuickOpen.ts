/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensions';

import nls = require('vs/nls');
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Mode, IModel, IDataSource, IRenderer, IRunner, IFilter, IContext } from 'vs/base/parts/quickopen/browser/quickOpen';
import { since } from 'vs/base/common/dates';
import { matchesContiguousSubString } from 'vs/base/common/filters';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IAutoFocus } from 'vs/base/parts/quickopen/browser/quickOpen';
import { IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IExtensionsService, IGalleryService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { InstallAction, UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { Action } from 'vs/base/common/actions';
import * as semver from 'semver';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import remote = require('remote');
const shell = remote.require('shell');
const $ = dom.emmet;

const InstallLabel = nls.localize('install', "Install Extension");
const UpdateLabel = nls.localize('update', "Update Extension");

export interface IHighlights {
	name: IHighlight[];
	displayName: IHighlight[];
	description: IHighlight[];
}

export enum ExtensionState {
	Uninstalled,
	Installed,
	Outdated
}

export interface IExtensionEntry {
	extension: IExtension;
	highlights: IHighlights;
	state: ExtensionState;
}

interface ITemplateData {
	root: HTMLElement;
	displayName: HighlightedLabel;
	version: HTMLElement;
	since: HTMLElement;
	author: HTMLElement;
	actionbar: ActionBar;
	description: HighlightedLabel;
	disposables: IDisposable[];
}

function getHighlights(input: string, extension: IExtension): IHighlights {
	const name = matchesContiguousSubString(input, extension.name) || [];
	const displayName = matchesContiguousSubString(input, extension.displayName) || [];
	const description = matchesContiguousSubString(input, extension.description) || [];

	if (!name.length && !displayName.length && !description.length) {
		return null;
	}

	return { name, displayName, description };
}

function extensionEquals(one: IExtension, other: IExtension): boolean {
	return one.publisher === other.publisher && one.name === other.name;
}

class OpenInGalleryAction extends Action {

	constructor(
		@IMessageService protected messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super('extensions.open-in-gallery', 'Readme', '', true);
	}

	public run(extension: IExtension): TPromise<any> {
		const url = `${this.contextService.getConfiguration().env.extensionsGallery.itemUrl}/${ extension.publisher }.${ extension.name }`;
		shell.openExternal(url);

		const hideMessage = this.messageService.show(Severity.Info, {
			message: nls.localize('installPrompt', "Would you like to install '{0}'?", extension.displayName),
			actions: [
				new Action('cancelaction', nls.localize('cancel', 'Cancel')),
				new Action('installNow', nls.localize('installNow', 'Install Now'), null, true, () => {
					hideMessage();

					const hideInstallMessage = this.messageService.show(Severity.Info, nls.localize('nowInstalling', "'{0}' is being installed...", extension.displayName));

					const action = this.instantiationService.createInstance(InstallAction, '');
					return action.run(extension).then(r => {
						hideInstallMessage();
						return TPromise.as(r);
					}, e => {
						hideInstallMessage();
						return TPromise.wrapError(e);
					});
				})
			]
		});

		return TPromise.as(null);
	}
}

class InstallRunner implements IRunner<IExtensionEntry> {

	private action: InstallAction;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {}

	run(entry: IExtensionEntry, mode: Mode, context: IContext): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		if (entry.state === ExtensionState.Installed) {
			return false;
		}

		if (!this.action) {
			this.action = this.instantiationService.createInstance(InstallAction, InstallLabel);
		}

		this.action.run(entry.extension).done(null, onUnexpectedError);
		return true;
	}
}

class Renderer implements IRenderer<IExtensionEntry> {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsService private extensionsService: IExtensionsService
	) {}

	getHeight(entry: IExtensionEntry): number {
		return 48;
	}

	getTemplateId(entry: IExtensionEntry): string {
		return 'extension';
	}

	renderTemplate(templateId: string, container: HTMLElement): ITemplateData {
		const root = dom.append(container, $('.extension'));
		const firstRow = dom.append(root, $('.row'));
		const secondRow = dom.append(root, $('.row'));
		const published = dom.append(firstRow, $('.published'));
		const since = dom.append(published, $('span.since'));
		const author = dom.append(published, $('span.author'));

		return {
			root,
			author,
			since,
			displayName: new HighlightedLabel(dom.append(firstRow, $('span.name'))),
			version: dom.append(firstRow, $('span.version')),
			actionbar: new ActionBar(dom.append(secondRow, $('.actions'))),
			description: new HighlightedLabel(dom.append(secondRow, $('span.description'))),
			disposables: []
		};
	}

	renderElement(entry: IExtensionEntry, templateId: string, data: ITemplateData): void {
		const extension = entry.extension;
		const date = extension.galleryInformation ? extension.galleryInformation.date : null;
		const publisher = extension.galleryInformation ? extension.galleryInformation.publisherDisplayName : extension.publisher;
		const actionOptions = { icon: true, label: false };

		const updateActions = () => {
			data.actionbar.clear();

			if (entry.extension.galleryInformation) {
				data.actionbar.push(this.instantiationService.createInstance(OpenInGalleryAction), { label: true, icon: false });
			}

			switch (entry.state) {
				case ExtensionState.Uninstalled:
					if (entry.extension.galleryInformation) {
						data.actionbar.push(this.instantiationService.createInstance(InstallAction, InstallLabel), actionOptions);
					}
					break;
				case ExtensionState.Installed:
					data.actionbar.push(this.instantiationService.createInstance(UninstallAction), actionOptions);
					break;
				case ExtensionState.Outdated:
					data.actionbar.push(this.instantiationService.createInstance(UninstallAction), actionOptions);
					data.actionbar.push(this.instantiationService.createInstance(InstallAction, UpdateLabel), actionOptions);
					break;
			}
		};

		const onExtensionStateChange = (e: IExtension, state: ExtensionState) => {
			if (extensionEquals(e, extension)) {
				entry.state = state;
				updateActions();
			}
		};

		data.actionbar.context = extension;
		updateActions();

		data.disposables = disposeAll(data.disposables);
		data.disposables.push(this.extensionsService.onDidInstallExtension(e => onExtensionStateChange(e, ExtensionState.Installed)));
		data.disposables.push(this.extensionsService.onDidUninstallExtension(e => onExtensionStateChange(e, ExtensionState.Uninstalled)));

		data.displayName.set(extension.displayName, entry.highlights.displayName);
		data.version.textContent = extension.version;
		data.since.textContent = date ? since(new Date(date)) : '';
		data.author.textContent = publisher;
		data.description.set(extension.description, entry.highlights.description);
		data.description.element.title = extension.description;
	}

	disposeTemplate(templateId: string, data: ITemplateData): void {
		data.displayName.dispose();
		data.description.dispose();
		data.disposables = disposeAll(data.disposables);
	}
}

class DataSource implements IDataSource<IExtensionEntry> {

	getId(entry: IExtensionEntry): string {
		const extension = entry.extension;

		if (extension.galleryInformation) {
			return `${ extension.galleryInformation.id }-${ extension.version }`;
		}

		return `local@${ extension.publisher }.${ extension.name }-${ extension.version }@${ extension.path || '' }`;
	}

	getLabel(entry: IExtensionEntry): string {
		return entry.extension.name;
	}
}

class LocalExtensionsModel implements IModel<IExtensionEntry> {

	public dataSource = new DataSource();
	public renderer: IRenderer<IExtensionEntry>;
	public runner = { run: () => false };
	public entries: IExtensionEntry[];

	constructor(
		private extensions: IExtension[],
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.renderer = instantiationService.createInstance(Renderer);
		this.entries = [];
	}

	public set input(input: string) {
		this.entries = this.extensions
			.map(extension => ({ extension, highlights: getHighlights(input, extension) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ extension, highlights }) => ({
				extension,
				highlights,
				state: ExtensionState.Installed
			}))
			.sort((a, b) => a.extension.name.localeCompare(b.extension.name));
	}
}

export class LocalExtensionsHandler extends QuickOpenHandler {

	private modelPromise: TPromise<LocalExtensionsModel>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsService private extensionsService: IExtensionsService
	) {
		super();
		this.modelPromise = null;
	}

	getResults(input: string): TPromise<IModel<IExtensionEntry>> {
		if (!this.modelPromise) {
			this.modelPromise = this.extensionsService.getInstalled()
				.then(extensions => this.instantiationService.createInstance(LocalExtensionsModel, extensions));
		}

		return this.modelPromise.then(model => {
			model.input = input;
			return model;
		});
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noExtensionsInstalled', "No extensions found");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}

	onClose(canceled: boolean): void {
		this.modelPromise = null;
	}
}

class GalleryExtensionsModel implements IModel<IExtensionEntry> {

	public dataSource = new DataSource();
	public renderer: IRenderer<IExtensionEntry>;
	public runner: IRunner<IExtensionEntry>;
	public entries: IExtensionEntry[];

	constructor(
		private galleryExtensions: IExtension[],
		private localExtensions: IExtension[],
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.renderer = instantiationService.createInstance(Renderer);
		this.runner = instantiationService.createInstance(InstallRunner);
		this.entries = [];
	}

	public set input(input: string) {
		this.entries = this.galleryExtensions
			.map(extension => ({ extension, highlights: getHighlights(input, extension) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ extension, highlights }: { extension: IExtension, highlights: IHighlights }) => {
				const local = this.localExtensions.filter(local => extensionEquals(local, extension))[0];

				return {
					extension,
					highlights,
					state: local
						? (local.version === extension.version ? ExtensionState.Installed : ExtensionState.Outdated)
						: ExtensionState.Uninstalled
				};
			})
			.sort((a, b) => a.extension.name.localeCompare(b.extension.name));
	}
}

export class GalleryExtensionsHandler extends QuickOpenHandler {

	private modelPromise: TPromise<GalleryExtensionsModel>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IGalleryService private galleryService: IGalleryService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();
	}

	getResults(input: string): TPromise<IModel<IExtensionEntry>> {
		if (!this.modelPromise) {
			this.telemetryService.publicLog('extensionGallery:open');
			this.modelPromise = TPromise.join<any>([this.galleryService.query(), this.extensionsService.getInstalled()])
				.then(result => this.instantiationService.createInstance(GalleryExtensionsModel, result[0], result[1]));
		}

		return this.modelPromise.then(model => {
			model.input = input;
			return model;
		});
	}

	onClose(canceled: boolean): void {
		this.modelPromise = null;
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noExtensionsToInstall', "No extensions found");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}

class OutdatedExtensionsModel implements IModel<IExtensionEntry> {

	public dataSource = new DataSource();
	public renderer: IRenderer<IExtensionEntry>;
	public runner: IRunner<IExtensionEntry>;
	public entries: IExtensionEntry[];

	constructor(
		private galleryExtensions: IExtension[],
		private localExtensions: IExtension[],
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.renderer = instantiationService.createInstance(Renderer);
		this.runner = instantiationService.createInstance(InstallRunner);
		this.entries = [];
	}

	public set input(input: string) {
		this.entries = this.galleryExtensions
			.map(extension => ({ extension, highlights: getHighlights(input, extension) }))
			.filter(({ extension, highlights }) => {
				const local = this.localExtensions.filter(local => extensionEquals(local, extension))[0];
				return local && semver.lt(local.version, extension.version) && !!highlights;
			})
			.map(({ extension, highlights }: { extension: IExtension, highlights: IHighlights }) => ({
				extension,
				highlights,
				state: ExtensionState.Outdated
			}))
			.sort((a, b) => a.extension.name.localeCompare(b.extension.name));
	}
}

export class OutdatedExtensionsHandler extends QuickOpenHandler {

	private modelPromise: TPromise<OutdatedExtensionsModel>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsService private extensionsService: IExtensionsService,
		@IGalleryService private galleryService: IGalleryService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();
	}

	getResults(input: string): TPromise<IModel<IExtensionEntry>> {
		if (!this.modelPromise) {
			this.telemetryService.publicLog('extensionGallery:open');
			this.modelPromise = TPromise.join<any>([this.galleryService.query(), this.extensionsService.getInstalled()])
				.then(result => this.instantiationService.createInstance(OutdatedExtensionsModel, result[0], result[1]));
		}

		return this.modelPromise.then(model => {
			model.input = input;
			return model;
		});
	}

	onClose(canceled: boolean): void {
		this.modelPromise = null;
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noOutdatedExtensions', "No outdated extensions found");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}