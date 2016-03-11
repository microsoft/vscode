/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { isNumber } from 'vs/base/common/types';
import * as dom from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IAutoFocus, Mode, IModel, IDataSource, IRenderer, IRunner, IContext, IAccessiblityProvider } from 'vs/base/parts/quickopen/common/quickOpen';
import { matchesContiguousSubString } from 'vs/base/common/filters';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IExtensionsService, IGalleryService, IExtensionTipsService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { InstallAction, UninstallAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { Action } from 'vs/base/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { shell } from 'electron';
import { extensionEquals, getOutdatedExtensions } from 'vs/workbench/parts/extensions/common/extensionsUtil';

const $ = dom.emmet;

const InstallLabel = nls.localize('install', "Install Extension");
const UpdateLabel = nls.localize('update', "Update Extension");

export interface IHighlights {
	id: IHighlight[];
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
	installCount: HTMLElement;
	author: HTMLElement;
	actionbar: ActionBar;
	description: HighlightedLabel;
	disposables: IDisposable[];
}

function getHighlights(input: string, extension: IExtension): IHighlights {
	const id = matchesContiguousSubString(input, `${ extension.publisher }.${ extension.name }`) || [];
	const name = matchesContiguousSubString(input, extension.name) || [];
	const displayName = matchesContiguousSubString(input, extension.displayName) || [];
	const description = matchesContiguousSubString(input, extension.description) || [];

	if (!id.length && !name.length && !displayName.length && !description.length) {
		return null;
	}

	return { id, name, displayName, description };
}

function extensionEntryCompare(one: IExtensionEntry, other: IExtensionEntry): number {
	const oneInstallCount = one.extension.galleryInformation ? one.extension.galleryInformation.installCount : 0;
	const otherInstallCount = other.extension.galleryInformation ? other.extension.galleryInformation.installCount : 0;
	const diff = otherInstallCount - oneInstallCount;

	if (diff !== 0) {
		return diff;
	}

	return one.extension.displayName.localeCompare(other.extension.displayName);
}

class OpenLicenseAction extends Action {

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super('extensions.open-license', nls.localize('license', "License"), '', true);
	}

	public run(extension: IExtension): TPromise<any> {
		const url = `${ this.contextService.getConfiguration().env.extensionsGallery.itemUrl }/${ extension.publisher }.${ extension.name }/license`;
		shell.openExternal(url);
		return TPromise.as(null);
	}
}

class OpenInGalleryAction extends Action {

	constructor(
		private promptToInstall: boolean,
		@IMessageService protected messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super('extensions.open-in-gallery', nls.localize('readme', "Readme"), '', true);
	}

	public run(extension: IExtension): TPromise<any> {
		const url = `${this.contextService.getConfiguration().env.extensionsGallery.itemUrl}/${ extension.publisher }.${ extension.name }`;
		shell.openExternal(url);

		if (!this.promptToInstall) {
			return TPromise.as(null);
		}

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

class AccessibilityProvider implements IAccessiblityProvider<IExtensionEntry> {

	public getAriaLabel(entry: IExtensionEntry): string {
		return nls.localize('extensionAriaLabel', "{0}, {1}, extensions picker", entry.extension.displayName, entry.extension.description);
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
		// Important to preserve order here.
		const root = dom.append(container, $('.extension'));
		const firstRow = dom.append(root, $('.row'));
		const secondRow = dom.append(root, $('.row'));
		const published = dom.append(firstRow, $('.published'));
		const displayName = new HighlightedLabel(dom.append(firstRow, $('span.name')));
		const installCount = dom.append(firstRow, $('span.installCount'));
		const version = dom.append(published, $('span.version'));
		const author = dom.append(published, $('span.author'));

		return {
			root,
			author,
			displayName,
			version,
			installCount,
			actionbar: new ActionBar(dom.append(secondRow, $('.actions'))),
			description: new HighlightedLabel(dom.append(secondRow, $('span.description'))),
			disposables: []
		};
	}

	renderElement(entry: IExtensionEntry, templateId: string, data: ITemplateData): void {
		const extension = entry.extension;
		const publisher = extension.galleryInformation ? extension.galleryInformation.publisherDisplayName : extension.publisher;
		const installCount = extension.galleryInformation ? extension.galleryInformation.installCount : null;
		const actionOptions = { icon: true, label: false };

		const updateActions = () => {
			data.actionbar.clear();

			if (entry.extension.galleryInformation) {
				data.actionbar.push(this.instantiationService.createInstance(OpenInGalleryAction, entry.state !== ExtensionState.Installed), { label: true, icon: false });
				data.actionbar.push(this.instantiationService.createInstance(OpenLicenseAction), { label: true, icon: false });
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
		data.disposables.push(this.extensionsService.onDidInstallExtension(e => onExtensionStateChange(e.extension, ExtensionState.Installed)));
		data.disposables.push(this.extensionsService.onDidUninstallExtension(e => onExtensionStateChange(e, ExtensionState.Uninstalled)));

		data.displayName.set(extension.displayName, entry.highlights.displayName);
		data.displayName.element.title = extension.name;
		data.version.textContent = extension.version;

		if (isNumber(installCount)) {
			data.installCount.textContent = String(installCount);
			dom.addClass(data.installCount, 'octicon');
			dom.addClass(data.installCount, 'octicon-cloud-download');

			if (!installCount) {
				data.installCount.title = nls.localize('installCountZero', "{0} wasn't downloaded yet.", extension.displayName);
			} else if (installCount === 1) {
				data.installCount.title = nls.localize('installCountOne', "{0} was downloaded once.", extension.displayName);
			} else {
				data.installCount.title = nls.localize('installCountMultiple', "{0} was downloaded {1} times.", extension.displayName, installCount);
			}
		} else {
			data.installCount.textContent = '';
			dom.removeClass(data.installCount, 'octicon');
			dom.removeClass(data.installCount, 'octicon-cloud-download');
		}

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

		if (!extension) {
			throw new Error(`Not an extension entry. Found ${ Object.keys(entry).slice(5) },... instead.`);
		}

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
	public accessibilityProvider: IAccessiblityProvider<IExtensionEntry> = new AccessibilityProvider();
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
			.map(extension => ({ extension, highlights: getHighlights(input.trim(), extension) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ extension, highlights }) => ({
				extension,
				highlights,
				state: ExtensionState.Installed
			}))
			.sort(extensionEntryCompare);
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

	public getAriaLabel(): string {
		return nls.localize('localExtensionsHandlerAriaLabel', "Type to narrow down the list of installed extensions");
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
	public accessibilityProvider: IAccessiblityProvider<IExtensionEntry> = new AccessibilityProvider();
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
			.map(extension => ({ extension, highlights: getHighlights(input.trim(), extension) }))
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
			.sort(extensionEntryCompare);
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

	public getAriaLabel(): string {
		return nls.localize('galleryExtensionsHandlerAriaLabel', "Type to narrow down the list of extensions from the gallery");
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
	public accessibilityProvider: IAccessiblityProvider<IExtensionEntry> = new AccessibilityProvider();
	public renderer: IRenderer<IExtensionEntry>;
	public runner: IRunner<IExtensionEntry>;
	public entries: IExtensionEntry[];

	constructor(
		private outdatedExtensions: IExtension[],
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.renderer = instantiationService.createInstance(Renderer);
		this.runner = instantiationService.createInstance(InstallRunner);
		this.entries = [];
	}

	public set input(input: string) {
		this.entries = this.outdatedExtensions
			.map(extension => ({ extension, highlights: getHighlights(input.trim(), extension) }))
			.filter(({ highlights }) => !!highlights)
			.map(({ extension, highlights }: { extension: IExtension, highlights: IHighlights }) => ({
				extension,
				highlights,
				state: ExtensionState.Outdated
			}))
			.sort(extensionEntryCompare);
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

	public getAriaLabel(): string {
		return nls.localize('outdatedExtensionsHandlerAriaLabel', "Type to narrow down the list of outdated extensions");
	}

	getResults(input: string): TPromise<IModel<IExtensionEntry>> {
		if (!this.modelPromise) {
			this.telemetryService.publicLog('extensionGallery:open');
			this.modelPromise = this.instantiationService.invokeFunction(getOutdatedExtensions)
				.then(outdated => this.instantiationService.createInstance(OutdatedExtensionsModel, outdated));
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


class SuggestedExtensionsModel implements IModel<IExtensionEntry> {

	public dataSource = new DataSource();
	public renderer: IRenderer<IExtensionEntry>;
	public runner: IRunner<IExtensionEntry>;
	public entries: IExtensionEntry[];

	constructor(
		private suggestedExtensions: IExtension[],
		private localExtensions: IExtension[],
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.renderer = instantiationService.createInstance(Renderer);
		this.runner = instantiationService.createInstance(InstallRunner);
		this.entries = [];
	}

	public set input(input: string) {
		this.entries = this.suggestedExtensions
			.map(extension => ({ extension, highlights: getHighlights(input.trim(), extension) }))
			.filter(({ extension, highlights }) => {
				const local = this.localExtensions.filter(local => extensionEquals(local, extension))[0];
				return !local && !!highlights;
			})
			.map(({ extension, highlights }: { extension: IExtension, highlights: IHighlights }) => {
				return {
					extension,
					highlights,
					state: ExtensionState.Uninstalled
				};
			})
			.sort(extensionEntryCompare);
	}
}


export class SuggestedExtensionHandler extends QuickOpenHandler {

	private modelPromise: TPromise<SuggestedExtensionsModel>;

	constructor(
		@IExtensionTipsService private extensionTipsService: IExtensionTipsService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IExtensionsService private extensionsService: IExtensionsService
	) {
		super();
	}

	getResults(input: string): TPromise<IModel<IExtensionEntry>> {
		if (!this.modelPromise) {
			this.telemetryService.publicLog('extensionRecommendations:open');
			this.modelPromise = TPromise.join<any>([this.extensionTipsService.getRecommendations(), this.extensionsService.getInstalled()])
				.then(result => this.instantiationService.createInstance(SuggestedExtensionsModel, result[0], result[1]));
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
		return nls.localize('noRecommendedExtensions', "No recommended extensions");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}
