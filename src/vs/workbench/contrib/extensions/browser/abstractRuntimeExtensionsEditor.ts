/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, clearNode } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';

 { index } from "vs/base/common/";
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from "vs/base/common/cancellation";
import { CancellationToken } from 'vs/base/common/cancellation';
import { fromNow } from 'vs/base/common/date';
import { memoize } from 'vs/base/common/decorators';
import { Event, Emitter } from "vs/base/common/event";
import { Disposable } from "vs/base/common/lifecycle";
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { URI } from "vs/base/common/uri";
import 'vs/css!./media/runtimeExtensionsEditor';
import * as nls from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IExtensionGalleryService, ILocalExtension, IGalleryExtension, InstallExtensionEvent, DidUninstallExtensionEvent, InstallOperation, InstallExtensionResult, IExtensionsControlManifest, IExtensionInfo, IProductVersion, IDeprecationInfo } from "vs/platform/extensionManagement/common/extensionManagement";
import { areSameExtensions, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, groupByExtension } from "vs/platform/extensionManagement/common/extensionManagementUtil";
import { ExtensionType, IExtension as IPlatformExtension, IExtensionIdentifier, IExtensionManifest, TargetPlatform } from "vs/platform/extensions/common/extensions";
import { IExtensionsControlManifest, InstallOperation, IExtensionGalleryService, IProductVersion, IGalleryExtension, IExtensionInfo, ILocalExtension, InstallExtensionEvent, InstallExtensionResult, DidUninstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionType, IExtension, IExtensionDescription, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { errorIcon, warningIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { ExtensionState, ExtensionRuntimeState } from "vs/workbench/contrib/extensions/common/extensions";
import { ExtensionRuntimeState, ExtensionState, IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServer, IWorkbenchExtensionManagementService, IResourceExtension } from "vs/workbench/services/extensionManagement/common/extensionManagement";
import { DefaultIconPath, EnablementState, IExtensionManagementServer, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { LocalWebWorkerRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { IExtensionHostProfile, IExtensionService, IExtensionsStatus } from 'vs/workbench/services/extensions/common/extensions';
import { IUserDataProfileService } from "vs/workbench/services/userDataProfile/common/userDataProfile";
import { Extension } from './abstractRuntimeExtensionsEditor';
import { IExtensionStateProvider } from './extensionsWorkbenchService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Emitter, Event, URI } from 'vs/workbench/workbench.web.main';
import { Extension } from './abstractRuntimeExtensionsEditor';
import { FileAccess } from "vs/base/common/network";
import { FileAccess } from "vs/base/common/network";
import { FileAccess } from "vs/base/common/network";
import * as resources from "vs/base/common/resources";
import * as resources from "vs/base/common/resources";
import * as resources from "vs/base/common/resources";
import * as semver from "vs/base/common/semver/semver";
import * as semver from "vs/base/common/semver/semver";
import * as semver from "vs/base/common/semver/semver";
import * as nls from "vs/nls";
import * as nls from "vs/nls";
import * as nls from "vs/nls";
import { IDeprecationInfo } from "vs/platform/extensionManagement/common/extensionManagement";
import { IDeprecationInfo } from "vs/platform/extensionManagement/common/extensionManagement";
import { IDeprecationInfo } from "vs/platform/extensionManagement/common/extensionManagement";
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from "vs/platform/extensionManagement/common/extensionManagementUtil";
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from "vs/platform/extensionManagement/common/extensionManagementUtil";
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from "vs/platform/extensionManagement/common/extensionManagementUtil";
import { IExtensionManifest, TargetPlatform } from "vs/platform/extensions/common/extensions";
import { IExtensionManifest, TargetPlatform } from "vs/platform/extensions/common/extensions";
import { IExtensionManifest, TargetPlatform } from "vs/platform/extensions/common/extensions";
import { IFileService } from "vs/platform/files/common/files";
import { IFileService } from "vs/platform/files/common/files";
import { IFileService } from "vs/platform/files/common/files";
import { ILogService } from "vs/platform/log/common/log";
import { ILogService } from "vs/platform/log/common/log";
import { ILogService } from "vs/platform/log/common/log";
import { IProductService } from "vs/platform/product/common/productService";
import { IProductService } from "vs/platform/product/common/productService";
import { IProductService } from "vs/platform/product/common/productService";
import { ShowCurrentReleaseNotesActionId } from "vs/workbench/contrib/update/common/update";
import { ShowCurrentReleaseNotesActionId } from "vs/workbench/contrib/update/common/update";
import { ShowCurrentReleaseNotesActionId } from "vs/workbench/contrib/update/common/update";
import { IResourceExtension } from "vs/workbench/services/extensionManagement/common/extensionManagement";
import { IResourceExtension } from "vs/workbench/services/extensionManagement/common/extensionManagement";
import { IResourceExtension } from "vs/workbench/services/extensionManagement/common/extensionManagement";
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ShowCurrentReleaseNotesActionId } from '../../update/common/update';

interface IExtensionProfileInformation {
	/**
	 * segment when the extension was running.
	 * 2*i = segment start time
	 * 2*i+1 = segment end time
	 */
	segments: number[];
	/**
	 * total time when the extension was running.
	 * (sum of all segment lengths).
	 */
	totalTime: number;
}

export interface IRuntimeExtension {
	originalIndex: number;
	description: IExtensionDescription;
	marketplaceInfo: IExtension | undefined;
	status: IExtensionsStatus;
	profileInfo?: IExtensionProfileInformation;
	unresponsiveProfile?: IExtensionHostProfile;
}

export abstract class AbstractRuntimeExtensionsEditor extends EditorPane {

	public static readonly ID: string = 'workbench.editor.runtimeExtensions';

	private _list: WorkbenchList<IRuntimeExtension> | null;
	private _elements: IRuntimeExtension[] | null;
	private _updateSoon: RunOnceScheduler;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ILabelService private readonly _labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IExtensionFeaturesManagementService private readonly _extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(AbstractRuntimeExtensionsEditor.ID, group, telemetryService, themeService, storageService);

		this._list = null;
		this._elements = null;
		this._updateSoon = this._register(new RunOnceScheduler(() => this._updateExtensions(), 200));

		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateSoon.schedule()));
		this._register(this._extensionFeaturesManagementService.onDidChangeAccessData(() => this._updateSoon.schedule()));
		this._updateExtensions();
	}

	protected async _updateExtensions(): Promise<void> {
		this._elements = await this._resolveExtensions();
		this._list?.splice(0, this._list.length, this._elements);
	}

	private async _resolveExtensions(): Promise<IRuntimeExtension[]> {
		// We only deal with extensions with source code!
		await this._extensionService.whenInstalledExtensionsRegistered();
		const extensionsDescriptions = this._extensionService.extensions.filter((extension) => {
			return Boolean(extension.main) || Boolean(extension.browser);
		});
		const marketplaceMap = new ExtensionIdentifierMap<IExtension>();
		const marketPlaceExtensions = await this._extensionsWorkbenchService.queryLocal();
		for (const extension of marketPlaceExtensions) {
			marketplaceMap.set(extension.identifier.id, extension);
		}

		const statusMap = this._extensionService.getExtensionsStatus();

		// group profile segments by extension
		const segments = new ExtensionIdentifierMap<number[]>();

		const profileInfo = this._getProfileInfo();
		if (profileInfo) {
			let currentStartTime = profileInfo.startTime;
			for (let i = 0, len = profileInfo.deltas.length; i < len; i++) {
				const id = profileInfo.ids[i];
				const delta = profileInfo.deltas[i];

				let extensionSegments = segments.get(id);
				if (!extensionSegments) {
					extensionSegments = [];
					segments.set(id, extensionSegments);
				}

				extensionSegments.push(currentStartTime);
				currentStartTime = currentStartTime + delta;
				extensionSegments.push(currentStartTime);
			}
		}

		let result: IRuntimeExtension[] = [];
		for (let i = 0, len = extensionsDescriptions.length; i < len; i++) {
			const extensionDescription = extensionsDescriptions[i];

			let extProfileInfo: IExtensionProfileInformation | null = null;
			if (profileInfo) {
				const extensionSegments = segments.get(extensionDescription.identifier) || [];
				let extensionTotalTime = 0;
				for (let j = 0, lenJ = extensionSegments.length / 2; j < lenJ; j++) {
					const startTime = extensionSegments[2 * j];
					const endTime = extensionSegments[2 * j + 1];
					extensionTotalTime += (endTime - startTime);
				}
				extProfileInfo = {
					segments: extensionSegments,
					totalTime: extensionTotalTime
				};
			}

			result[i] = {
				originalIndex: i,
				description: extensionDescription,
				marketplaceInfo: marketplaceMap.get(extensionDescription.identifier),
				status: statusMap[extensionDescription.identifier.value],
				profileInfo: extProfileInfo || undefined,
				unresponsiveProfile: this._getUnresponsiveProfile(extensionDescription.identifier)
			};
		}

		result = result.filter(element => element.status.activationStarted);

		// bubble up extensions that have caused slowness

		const isUnresponsive = (extension: IRuntimeExtension): boolean =>
			extension.unresponsiveProfile === profileInfo;

		const profileTime = (extension: IRuntimeExtension): number =>
			extension.profileInfo?.totalTime ?? 0;

		const activationTime = (extension: IRuntimeExtension): number =>
			(extension.status.activationTimes?.codeLoadingTime ?? 0) +
			(extension.status.activationTimes?.activateCallTime ?? 0);

		result = result.sort((a, b) => {
			if (isUnresponsive(a) || isUnresponsive(b)) {
				return +isUnresponsive(b) - +isUnresponsive(a);
			} else if (profileTime(a) || profileTime(b)) {
				return profileTime(b) - profileTime(a);
			} else if (activationTime(a) || activationTime(b)) {
				return activationTime(b) - activationTime(a);
			}
			return a.originalIndex - b.originalIndex;
		});

		return result;
	}

	protected createEditor(parent: HTMLElement): void {
		parent.classList.add('runtime-extensions-editor');

		const TEMPLATE_ID = 'runtimeExtensionElementTemplate';

		const delegate = new class implements IListVirtualDelegate<IRuntimeExtension> {
			getHeight(element: IRuntimeExtension): number {
				return 70;
			}
			getTemplateId(element: IRuntimeExtension): string {
				return TEMPLATE_ID;
			}
		};

		interface IRuntimeExtensionTemplateData {
			root: HTMLElement;
			element: HTMLElement;
			icon: HTMLImageElement;
			name: HTMLElement;
			version: HTMLElement;
			msgContainer: HTMLElement;
			actionbar: ActionBar;
			activationTime: HTMLElement;
			profileTime: HTMLElement;
			disposables: IDisposable[];
			elementDisposables: IDisposable[];
		}

		const renderer: IListRenderer<IRuntimeExtension, IRuntimeExtensionTemplateData> = {
			templateId: TEMPLATE_ID,
			renderTemplate: (root: HTMLElement): IRuntimeExtensionTemplateData => {
				const element = append(root, $('.extension'));
				const iconContainer = append(element, $('.icon-container'));
				const icon = append(iconContainer, $<HTMLImageElement>('img.icon'));

				const desc = append(element, $('div.desc'));
				const headerContainer = append(desc, $('.header-container'));
				const header = append(headerContainer, $('.header'));
				const name = append(header, $('div.name'));
				const version = append(header, $('span.version'));

				const msgContainer = append(desc, $('div.msg'));

				const actionbar = new ActionBar(desc);
				actionbar.onDidRun(({ error }) => error && this._notificationService.error(error));

				const timeContainer = append(element, $('.time'));
				const activationTime = append(timeContainer, $('div.activation-time'));
				const profileTime = append(timeContainer, $('div.profile-time'));

				const disposables = [actionbar];

				return {
					root,
					element,
					icon,
					name,
					version,
					actionbar,
					activationTime,
					profileTime,
					msgContainer,
					disposables,
					elementDisposables: [],
				};
			},

			renderElement: (element: IRuntimeExtension, index: number, data: IRuntimeExtensionTemplateData): void => {

				data.elementDisposables = dispose(data.elementDisposables);

				data.root.classList.toggle('odd', index % 2 === 1);

				data.elementDisposables.push(addDisposableListener(data.icon, 'error', () => data.icon.src = element.marketplaceInfo?.iconUrlFallback || DefaultIconPath, { once: true }));
				data.icon.src = element.marketplaceInfo?.iconUrl || DefaultIconPath;

				if (!data.icon.complete) {
					data.icon.style.visibility = 'hidden';
					data.icon.onload = () => data.icon.style.visibility = 'inherit';
				} else {
					data.icon.style.visibility = 'inherit';
				}
				data.name.textContent = (element.marketplaceInfo?.displayName || element.description.identifier.value).substr(0, 50);
				data.version.textContent = element.description.version;

				const activationTimes = element.status.activationTimes;
				if (activationTimes) {
					const syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
					data.activationTime.textContent = activationTimes.activationReason.startup ? `Startup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;
				} else {
					data.activationTime.textContent = `Activating...`;
				}

				data.actionbar.clear();
				const slowExtensionAction = this._createSlowExtensionAction(element);
				if (slowExtensionAction) {
					data.actionbar.push(slowExtensionAction, { icon: false, label: true });
				}
				if (isNonEmptyArray(element.status.runtimeErrors)) {
					const reportExtensionIssueAction = this._createReportExtensionIssueAction(element);
					if (reportExtensionIssueAction) {
						data.actionbar.push(reportExtensionIssueAction, { icon: false, label: true });
					}
				}

				let title: string;
				if (activationTimes) {
					const activationId = activationTimes.activationReason.extensionId.value;
					const activationEvent = activationTimes.activationReason.activationEvent;
					if (activationEvent === '*') {
						title = nls.localize({
							key: 'starActivation',
							comment: [
								'{0} will be an extension identifier'
							]
						}, "Activated by {0} on start-up", activationId);
					} else if (/^workspaceContains:/.test(activationEvent)) {
						const fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
						if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
							title = nls.localize({
								key: 'workspaceContainsGlobActivation',
								comment: [
									'{0} will be a glob pattern',
									'{1} will be an extension identifier'
								]
							}, "Activated by {1} because a file matching {0} exists in your workspace", fileNameOrGlob, activationId);
						} else {
							title = nls.localize({
								key: 'workspaceContainsFileActivation',
								comment: [
									'{0} will be a file name',
									'{1} will be an extension identifier'
								]
							}, "Activated by {1} because file {0} exists in your workspace", fileNameOrGlob, activationId);
						}
					} else if (/^workspaceContainsTimeout:/.test(activationEvent)) {
						const glob = activationEvent.substr('workspaceContainsTimeout:'.length);
						title = nls.localize({
							key: 'workspaceContainsTimeout',
							comment: [
								'{0} will be a glob pattern',
								'{1} will be an extension identifier'
							]
						}, "Activated by {1} because searching for {0} took too long", glob, activationId);
					} else if (activationEvent === 'onStartupFinished') {
						title = nls.localize({
							key: 'startupFinishedActivation',
							comment: [
								'This refers to an extension. {0} will be an activation event.'
							]
						}, "Activated by {0} after start-up finished", activationId);
					} else if (/^onLanguage:/.test(activationEvent)) {
						const language = activationEvent.substr('onLanguage:'.length);
						title = nls.localize('languageActivation', "Activated by {1} because you opened a {0} file", language, activationId);
					} else {
						title = nls.localize({
							key: 'workspaceGenericActivation',
							comment: [
								'{0} will be an activation event, like e.g. \'language:typescript\', \'debug\', etc.',
								'{1} will be an extension identifier'
							]
						}, "Activated by {1} on {0}", activationEvent, activationId);
					}
				} else {
					title = nls.localize('extensionActivating', "Extension is activating...");
				}
				data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.activationTime, title));

				clearNode(data.msgContainer);

				if (this._getUnresponsiveProfile(element.description.identifier)) {
					const el = $('span', undefined, ...renderLabelWithIcons(` $(alert) Unresponsive`));
					const extensionHostFreezTitle = nls.localize('unresponsive.title', "Extension has caused the extension host to freeze.");
					data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), el, extensionHostFreezTitle));

					data.msgContainer.appendChild(el);
				}

				if (isNonEmptyArray(element.status.runtimeErrors)) {
					const el = $('span', undefined, ...renderLabelWithIcons(`$(bug) ${nls.localize('errors', "{0} uncaught errors", element.status.runtimeErrors.length)}`));
					data.msgContainer.appendChild(el);
				}

				if (element.status.messages && element.status.messages.length > 0) {
					const el = $('span', undefined, ...renderLabelWithIcons(`$(alert) ${element.status.messages[0].message}`));
					data.msgContainer.appendChild(el);
				}

				let extraLabel: string | null = null;
				if (element.status.runningLocation && element.status.runningLocation.equals(new LocalWebWorkerRunningLocation(0))) {
					extraLabel = `$(globe) web worker`;
				} else if (element.description.extensionLocation.scheme === Schemas.vscodeRemote) {
					const hostLabel = this._labelService.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
					if (hostLabel) {
						extraLabel = `$(remote) ${hostLabel}`;
					} else {
						extraLabel = `$(remote) ${element.description.extensionLocation.authority}`;
					}
				} else if (element.status.runningLocation && element.status.runningLocation.affinity > 0) {
					extraLabel = element.status.runningLocation instanceof LocalWebWorkerRunningLocation
						? `$(globe) web worker ${element.status.runningLocation.affinity + 1}`
						: `$(server-process) local process ${element.status.runningLocation.affinity + 1}`;
				}

				if (extraLabel) {
					const el = $('span', undefined, ...renderLabelWithIcons(extraLabel));
					data.msgContainer.appendChild(el);
				}

				const features = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
				for (const feature of features) {
					const accessData = this._extensionFeaturesManagementService.getAccessData(element.description.identifier, feature.id);
					if (accessData) {
						const status = accessData?.current?.status;
						if (status) {
							data.msgContainer.appendChild($('span', undefined, `${feature.label}: `));
							data.msgContainer.appendChild($('span', undefined, ...renderLabelWithIcons(`$(${status.severity === Severity.Error ? errorIcon.id : warningIcon.id}) ${status.message}`)));
						}
						if (accessData?.totalCount > 0) {
							const element = $('span', undefined, `${nls.localize('requests count', "{0} Requests: {1} (Overall)", feature.label, accessData.totalCount)}${accessData.current ? nls.localize('session requests count', ", {0} (Session)", accessData.current.count) : ''}`);
							if (accessData.current) {
								const title = nls.localize('requests count title', "Last request was {0}.", fromNow(accessData.current.lastAccessed, true, true));
								data.elementDisposables.push(this._hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), element, title));
							}

							data.msgContainer.appendChild(element);
						}
					}
				}

				if (element.profileInfo) {
					data.profileTime.textContent = `Profile: ${(element.profileInfo.totalTime / 1000).toFixed(2)}ms`;
				} else {
					data.profileTime.textContent = '';
				}

			},

			disposeTemplate: (data: IRuntimeExtensionTemplateData): void => {
				data.disposables = dispose(data.disposables);
			}
		};

		this._list = <WorkbenchList<IRuntimeExtension>>this._instantiationService.createInstance(WorkbenchList,
			'RuntimeExtensions',
			parent, delegate, [renderer], {
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			overrideStyles: {
				listBackground: editorBackground
			},
			accessibilityProvider: new class implements IListAccessibilityProvider<IRuntimeExtension> {
				getWidgetAriaLabel(): string {
					return nls.localize('runtimeExtensions', "Runtime Extensions");
				}
				getAriaLabel(element: IRuntimeExtension): string | null {
					return element.description.name;
				}
			}
		});

		this._list.splice(0, this._list.length, this._elements || undefined);

		this._list.onContextMenu((e) => {
			if (!e.element) {
				return;
			}

			const actions: IAction[] = [];

			actions.push(new Action(
				'runtimeExtensionsEditor.action.copyId',
				nls.localize('copy id', "Copy id ({0})", e.element.description.identifier.value),
				undefined,
				true,
				() => {
					this._clipboardService.writeText(e.element!.description.identifier.value);
				}
			));

			const reportExtensionIssueAction = this._createReportExtensionIssueAction(e.element);
			if (reportExtensionIssueAction) {
				actions.push(reportExtensionIssueAction);
			}
			actions.push(new Separator());

			if (e.element.marketplaceInfo) {
				actions.push(new Action('runtimeExtensionsEditor.action.disableWorkspace', nls.localize('disable workspace', "Disable (Workspace)"), undefined, true, () => this._extensionsWorkbenchService.setEnablement(e.element!.marketplaceInfo!, EnablementState.DisabledWorkspace)));
				actions.push(new Action('runtimeExtensionsEditor.action.disable', nls.localize('disable', "Disable"), undefined, true, () => this._extensionsWorkbenchService.setEnablement(e.element!.marketplaceInfo!, EnablementState.DisabledGlobally)));
			}
			actions.push(new Separator());

			const profileAction = this._createProfileAction();
			if (profileAction) {
				actions.push(profileAction);
			}
			const saveExtensionHostProfileAction = this.saveExtensionHostProfileAction;
			if (saveExtensionHostProfileAction) {
				actions.push(saveExtensionHostProfileAction);
			}

			this._contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions
			});
		});
	}

	@memoize
	private get saveExtensionHostProfileAction(): IAction | null {
		return this._createSaveExtensionHostProfileAction();
	}

	public layout(dimension: Dimension): void {
		this._list?.layout(dimension.height);
	}

	protected abstract _getProfileInfo(): IExtensionHostProfile | null;
	protected abstract _getUnresponsiveProfile(extensionId: ExtensionIdentifier): IExtensionHostProfile | undefined;
	protected abstract _createSlowExtensionAction(element: IRuntimeExtension): Action | null;
	protected abstract _createReportExtensionIssueAction(element: IRuntimeExtension): Action | null;
	protected abstract _createSaveExtensionHostProfileAction(): Action | null;
	protected abstract _createProfileAction(): Action | null;
}

export class ShowRuntimeExtensionsAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.showRuntimeExtensions',
			title: nls.localize2('showRuntimeExtensions', "Show Running Extensions"),
			category: Categories.Developer,
			f1: true,
			menu: {
				id: MenuId.ViewContainerTitle,
				when: ContextKeyExpr.equals('viewContainer', 'workbench.view.extensions'),
				group: '2_enablement',
				order: 3
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IEditorService).openEditor(RuntimeExtensionsInput.instance, { pinned: true });
	}
}

export class Extensions extends Disposable {

	static updateExtensionFromControlManifest(extension: Extension, extensionsControlManifest: IExtensionsControlManifest): void {
		extension.isMalicious = extensionsControlManifest.malicious.some(identifier => areSameExtensions(extension.identifier, identifier));
		extension.deprecationInfo = extensionsControlManifest.deprecated ? extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()] : undefined;
	}

	private readonly _onChange = this._register(new Emitter<{ extension: Extension; operation?: InstallOperation; } | undefined>());
	get onChange() { return this._onChange.event; }

	private readonly _onReset = this._register(new Emitter<void>());
	get onReset() { return this._onReset.event; }

	private installing: Extension[] = [];
	private uninstalling: Extension[] = [];
	private installed: Extension[] = [];

	constructor(
		readonly server: IExtensionManagementServer,
		private readonly stateProvider: IExtensionStateProvider<ExtensionState>,
		private readonly runtimeStateProvider: IExtensionStateProvider<ExtensionRuntimeState | undefined>,
		private readonly isWorkspaceServer: boolean,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkbenchExtensionManagementService private readonly workbenchExtensionManagementService: IWorkbenchExtensionManagementService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this._register(server.extensionManagementService.onInstallExtension(e => this.onInstallExtension(e)));
		this._register(server.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(server.extensionManagementService.onUninstallExtension(e => this.onUninstallExtension(e.identifier)));
		this._register(server.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
		this._register(server.extensionManagementService.onDidUpdateExtensionMetadata(e => this.onDidUpdateExtensionMetadata(e.local)));
		this._register(server.extensionManagementService.onDidChangeProfile(() => this.reset()));
		this._register(extensionEnablementService.onEnablementChanged(e => this.onEnablementChanged(e)));
		this._register(Event.any(this.onChange, this.onReset)(() => this._local = undefined));
		if (this.isWorkspaceServer) {
			this._register(this.workbenchExtensionManagementService.onInstallExtension(e => {
				if (e.workspaceScoped) {
					this.onInstallExtension(e);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onDidInstallExtensions(e => {
				const result = e.filter(e => e.workspaceScoped);
				if (result.length) {
					this.onDidInstallExtensions(result);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onUninstallExtension(e => {
				if (e.workspaceScoped) {
					this.onUninstallExtension(e.identifier);
				}
			}));
			this._register(this.workbenchExtensionManagementService.onDidUninstallExtension(e => {
				if (e.workspaceScoped) {
					this.onDidUninstallExtension(e);
				}
			}));
		}
	}

	private _local: IExtension[] | undefined;
	get local(): IExtension[] {
		if (!this._local) {
			this._local = [];
			for (const extension of this.installed) {
				this._local.push(extension);
			}
			for (const extension of this.installing) {
				if (!this.installed.some(installed => areSameExtensions(installed.identifier, extension.identifier))) {
					this._local.push(extension);
				}
			}
		}
		return this._local;
	}

	async queryInstalled(productVersion: IProductVersion): Promise<IExtension[]> {
		await this.fetchInstalledExtensions(productVersion);
		this._onChange.fire(undefined);
		return this.local;
	}

	async syncInstalledExtensionsWithGallery(galleryExtensions: IGalleryExtension[], productVersion: IProductVersion): Promise<void> {
		const extensions = await this.mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions, productVersion);
		for (const [extension, gallery] of extensions) {
			// update metadata of the extension if it does not exist
			if (extension.local && !extension.local.identifier.uuid) {
				extension.local = await this.updateMetadata(extension.local, gallery);
			}
			if (!extension.gallery || extension.gallery.version !== gallery.version || extension.gallery.properties.targetPlatform !== gallery.properties.targetPlatform) {
				extension.gallery = gallery;
				this._onChange.fire({ extension });
			}
		}
	}

	private async mapInstalledExtensionWithCompatibleGalleryExtension(galleryExtensions: IGalleryExtension[], productVersion: IProductVersion): Promise<[Extension, IGalleryExtension][]> {
		const mappedExtensions = this.mapInstalledExtensionWithGalleryExtension(galleryExtensions);
		const targetPlatform = await this.server.extensionManagementService.getTargetPlatform();
		const compatibleGalleryExtensions: IGalleryExtension[] = [];
		const compatibleGalleryExtensionsToFetch: IExtensionInfo[] = [];
		await Promise.allSettled(mappedExtensions.map(async ([extension, gallery]) => {
			if (extension.local) {
				if (await this.galleryService.isExtensionCompatible(gallery, extension.local.preRelease, targetPlatform, productVersion)) {
					compatibleGalleryExtensions.push(gallery);
				} else {
					compatibleGalleryExtensionsToFetch.push({ ...extension.local.identifier, preRelease: extension.local.preRelease });
				}
			}
		}));
		if (compatibleGalleryExtensionsToFetch.length) {
			const result = await this.galleryService.getExtensions(compatibleGalleryExtensionsToFetch, { targetPlatform, compatible: true, queryAllVersions: true, productVersion }, CancellationToken.None);
			compatibleGalleryExtensions.push(...result);
		}
		return this.mapInstalledExtensionWithGalleryExtension(compatibleGalleryExtensions);
	}

	private mapInstalledExtensionWithGalleryExtension(galleryExtensions: IGalleryExtension[]): [Extension, IGalleryExtension][] {
		const mappedExtensions: [Extension, IGalleryExtension][] = [];
		const byUUID = new Map<string, IGalleryExtension>(), byID = new Map<string, IGalleryExtension>();
		for (const gallery of galleryExtensions) {
			byUUID.set(gallery.identifier.uuid, gallery);
			byID.set(gallery.identifier.id.toLowerCase(), gallery);
		}
		for (const installed of this.installed) {
			if (installed.uuid) {
				const gallery = byUUID.get(installed.uuid);
				if (gallery) {
					mappedExtensions.push([installed, gallery]);
					continue;
				}
			}
			if (installed.local?.source !== 'resource') {
				const gallery = byID.get(installed.identifier.id.toLowerCase());
				if (gallery) {
					mappedExtensions.push([installed, gallery]);
				}
			}
		}
		return mappedExtensions;
	}

	private async updateMetadata(localExtension: ILocalExtension, gallery: IGalleryExtension): Promise<ILocalExtension> {
		let isPreReleaseVersion = false;
		if (localExtension.manifest.version !== gallery.version) {
			type GalleryServiceMatchInstalledExtensionClassification = {
				owner: 'sandy081';
				comment: 'Report when a request is made to update metadata of an installed extension';
			};
			this.telemetryService.publicLog2<{}, GalleryServiceMatchInstalledExtensionClassification>('galleryService:updateMetadata');
			const galleryWithLocalVersion: IGalleryExtension | undefined = (await this.galleryService.getExtensions([{ ...localExtension.identifier, version: localExtension.manifest.version }], CancellationToken.None))[0];
			isPreReleaseVersion = !!galleryWithLocalVersion?.properties?.isPreReleaseVersion;
		}
		return this.server.extensionManagementService.updateMetadata(localExtension, { id: gallery.identifier.uuid, publisherDisplayName: gallery.publisherDisplayName, publisherId: gallery.publisherId, isPreReleaseVersion }, this.userDataProfileService.currentProfile.extensionsResource);
	}

	canInstall(galleryExtension: IGalleryExtension): Promise<boolean> {
		return this.server.extensionManagementService.canInstall(galleryExtension);
	}

	private onInstallExtension(event: InstallExtensionEvent): void {
		const { source } = event;
		if (source && !URI.isUri(source)) {
			const extension = this.installed.find(e => areSameExtensions(e.identifier, source.identifier))
				?? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, undefined, source, undefined);
			this.installing.push(extension);
			this._onChange.fire({ extension });
		}
	}

	private async fetchInstalledExtensions(productVersion?: IProductVersion): Promise<void> {
		const extensionsControlManifest = await this.server.extensionManagementService.getExtensionsControlManifest();
		const all = await this.server.extensionManagementService.getInstalled(undefined, undefined, productVersion);
		if (this.isWorkspaceServer) {
			all.push(...await this.workbenchExtensionManagementService.getInstalledWorkspaceExtensions(true));
		}

		// dedup workspace, user and system extensions by giving priority to workspace first and then to user extension.
		const installed = groupByExtension(all, r => r.identifier).reduce((result, extensions) => {
			if (extensions.length === 1) {
				result.push(extensions[0]);
			} else {
				let workspaceExtension: ILocalExtension | undefined, userExtension: ILocalExtension | undefined, systemExtension: ILocalExtension | undefined;
				for (const extension of extensions) {
					if (extension.isWorkspaceScoped) {
						workspaceExtension = extension;
					} else if (extension.type === ExtensionType.User) {
						userExtension = extension;
					} else {
						systemExtension = extension;
					}
				}
				const extension = workspaceExtension ?? userExtension ?? systemExtension;
				if (extension) {
					result.push(extension);
				}
			}
			return result;
		}, []);

		const byId = index(this.installed, e => e.local ? e.local.identifier.id : e.identifier.id);
		this.installed = installed.map(local => {
			const extension = byId[local.identifier.id] || this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, undefined, undefined);
			extension.local = local;
			extension.enablementState = this.extensionEnablementService.getEnablementState(local);
			Extensions.updateExtensionFromControlManifest(extension, extensionsControlManifest);
			return extension;
		});
	}

	private async reset(): Promise<void> {
		this.installed = [];
		this.installing = [];
		this.uninstalling = [];
		await this.fetchInstalledExtensions();
		this._onReset.fire();
	}

	private async onDidInstallExtensions(results: readonly InstallExtensionResult[]): Promise<void> {
		for (const event of results) {
			const { local, source } = event;
			const gallery = source && !URI.isUri(source) ? source : undefined;
			const location = source && URI.isUri(source) ? source : undefined;
			const installingExtension = gallery ? this.installing.filter(e => areSameExtensions(e.identifier, gallery.identifier))[0] : null;
			this.installing = installingExtension ? this.installing.filter(e => e !== installingExtension) : this.installing;

			let extension: Extension | undefined = installingExtension ? installingExtension
				: (location || local) ? this.instantiationService.createInstance(Extension, this.stateProvider, this.runtimeStateProvider, this.server, local, undefined, undefined)
					: undefined;
			if (extension) {
				if (local) {
					const installed = this.installed.filter(e => areSameExtensions(e.identifier, extension!.identifier))[0];
					if (installed) {
						extension = installed;
					} else {
						this.installed.push(extension);
					}
					extension.local = local;
					if (!extension.gallery) {
						extension.gallery = gallery;
					}
					Extensions.updateExtensionFromControlManifest(extension, await this.server.extensionManagementService.getExtensionsControlManifest());
					extension.enablementState = this.extensionEnablementService.getEnablementState(local);
				}
			}
			this._onChange.fire(!local || !extension ? undefined : { extension, operation: event.operation });
			if (extension && extension.local && !extension.gallery && extension.local.source !== 'resource') {
				await this.syncInstalledExtensionWithGallery(extension);
			}
		}
	}

	private async onDidUpdateExtensionMetadata(local: ILocalExtension): Promise<void> {
		const extension = this.installed.find(e => areSameExtensions(e.identifier, local.identifier));
		if (extension?.local) {
			const hasChanged = extension.local.pinned !== local.pinned
				|| extension.local.preRelease !== local.preRelease;
			extension.local = local;
			if (hasChanged) {
				this._onChange.fire({ extension });
			}
		}
	}

	private async syncInstalledExtensionWithGallery(extension: Extension): Promise<void> {
		if (!this.galleryService.isEnabled()) {
			return;
		}
		type GalleryServiceMatchInstalledExtensionClassification = {
			owner: 'sandy081';
			comment: 'Report when a request is made to match installed extension with gallery';
		};
		this.telemetryService.publicLog2<{}, GalleryServiceMatchInstalledExtensionClassification>('galleryService:matchInstalledExtension');
		const [compatible] = await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: extension.local?.preRelease }], { compatible: true, targetPlatform: await this.server.extensionManagementService.getTargetPlatform() }, CancellationToken.None);
		if (compatible) {
			extension.gallery = compatible;
			this._onChange.fire({ extension });
		}
	}

	private onUninstallExtension(identifier: IExtensionIdentifier): void {
		const extension = this.installed.filter(e => areSameExtensions(e.identifier, identifier))[0];
		if (extension) {
			const uninstalling = this.uninstalling.filter(e => areSameExtensions(e.identifier, identifier))[0] || extension;
			this.uninstalling = [uninstalling, ...this.uninstalling.filter(e => !areSameExtensions(e.identifier, identifier))];
			this._onChange.fire(uninstalling ? { extension: uninstalling } : undefined);
		}
	}

	private onDidUninstallExtension({ identifier, error }: DidUninstallExtensionEvent): void {
		const uninstalled = this.uninstalling.find(e => areSameExtensions(e.identifier, identifier)) || this.installed.find(e => areSameExtensions(e.identifier, identifier));
		this.uninstalling = this.uninstalling.filter(e => !areSameExtensions(e.identifier, identifier));
		if (!error) {
			this.installed = this.installed.filter(e => !areSameExtensions(e.identifier, identifier));
		}
		if (uninstalled) {
			this._onChange.fire({ extension: uninstalled });
		}
	}

	private onEnablementChanged(platformExtensions: readonly IPlatformExtension[]) {
		const extensions = this.local.filter(e => platformExtensions.some(p => areSameExtensions(e.identifier, p.identifier)));
		for (const extension of extensions) {
			if (extension.local) {
				const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
				if (enablementState !== extension.enablementState) {
					(extension as Extension).enablementState = enablementState;
					this._onChange.fire({ extension: extension as Extension });
				}
			}
		}
	}

	getExtensionState(extension: Extension): ExtensionState {
		if (extension.gallery && this.installing.some(e => !!e.gallery && areSameExtensions(e.gallery.identifier, extension.gallery!.identifier))) {
			return ExtensionState.Installing;
		}
		if (this.uninstalling.some(e => areSameExtensions(e.identifier, extension.identifier))) {
			return ExtensionState.Uninstalling;
		}
		const local = this.installed.filter(e => e === extension || (e.gallery && extension.gallery && areSameExtensions(e.gallery.identifier, extension.gallery.identifier)))[0];
		return local ? ExtensionState.Installed : ExtensionState.Uninstalled;
	}
}
Array;
export class Extension implements IExtension {

    public enablementState: EnablementState = EnablementState.EnabledGlobally;
    public readonly resourceExtension: IResourceExtension | undefined;

    constructor(
        private stateProvider: IExtensionStateProvider<ExtensionState>,
        private runtimeStateProvider: IExtensionStateProvider<ExtensionRuntimeState | undefined>,
        public readonly server: IExtensionManagementServer | undefined,
        public local: ILocalExtension | undefined,
        public gallery: IGalleryExtension | undefined,
        private readonly resourceExtensionInfo: { resourceExtension: IResourceExtension; isWorkspaceScoped: boolean; } | undefined,
        @IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
        @ITelemetryService private readonly telemetryService: ITelemetryService,
        @ILogService private readonly logService: ILogService,
        @IFileService private readonly fileService: IFileService,
        @IProductService private readonly productService: IProductService
    ) {
        this.resourceExtension = resourceExtensionInfo?.resourceExtension;
    }

    get type(): ExtensionType {
        return this.local ? this.local.type : ExtensionType.User;
    }

    get isBuiltin(): boolean {
        return this.local ? this.local.isBuiltin : false;
    }

    get isWorkspaceScoped(): boolean {
        if (this.local) {
            return this.local.isWorkspaceScoped;
        }
        if (this.resourceExtensionInfo) {
            return this.resourceExtensionInfo.isWorkspaceScoped;
        }
        return false;
    }

    get name(): string {
        if (this.gallery) {
            return this.gallery.name;
        }
        return this.getManifestFromLocalOrResource()?.name ?? '';
    }

    get displayName(): string {
        if (this.gallery) {
            return this.gallery.displayName || this.gallery.name;
        }

        return this.getManifestFromLocalOrResource()?.displayName ?? this.name;
    }

    get identifier(): IExtensionIdentifier {
        if (this.gallery) {
            return this.gallery.identifier;
        }
        if (this.resourceExtension) {
            return this.resourceExtension.identifier;
        }
        return this.local!.identifier;
    }

    get uuid(): string | undefined {
        return this.gallery ? this.gallery.identifier.uuid : this.local?.identifier.uuid;
    }

    get publisher(): string {
        if (this.gallery) {
            return this.gallery.publisher;
        }
        return this.getManifestFromLocalOrResource()?.publisher ?? '';
    }

    get publisherDisplayName(): string {
        if (this.gallery) {
            return this.gallery.publisherDisplayName || this.gallery.publisher;
        }

        if (this.local?.publisherDisplayName) {
            return this.local.publisherDisplayName;
        }

        return this.publisher;
    }

    get publisherUrl(): URI | undefined {
        if (!this.productService.extensionsGallery || !this.gallery) {
            return undefined;
        }

        return resources.joinPath(URI.parse(this.productService.extensionsGallery.publisherUrl), this.publisher);
    }

    get publisherDomain(): { link: string; verified: boolean; } | undefined {
        return this.gallery?.publisherDomain;
    }

    get publisherSponsorLink(): URI | undefined {
        return this.gallery?.publisherSponsorLink ? URI.parse(this.gallery.publisherSponsorLink) : undefined;
    }

    get version(): string {
        return this.local ? this.local.manifest.version : this.latestVersion;
    }

    get pinned(): boolean {
        return !!this.local?.pinned;
    }

    get latestVersion(): string {
        return this.gallery ? this.gallery.version : this.getManifestFromLocalOrResource()?.version ?? '';
    }

    get description(): string {
        return this.gallery ? this.gallery.description : this.getManifestFromLocalOrResource()?.description ?? '';
    }

    get url(): string | undefined {
        if (!this.productService.extensionsGallery || !this.gallery) {
            return undefined;
        }

        return `${this.productService.extensionsGallery.itemUrl}?itemName=${this.publisher}.${this.name}`;
    }

    get iconUrl(): string {
        return this.galleryIconUrl || this.resourceExtensionIconUrl || this.localIconUrl || this.defaultIconUrl;
    }

    get iconUrlFallback(): string {
        return this.galleryIconUrlFallback || this.resourceExtensionIconUrl || this.localIconUrl || this.defaultIconUrl;
    }

    private get localIconUrl(): string | null {
        if (this.local && this.local.manifest.icon) {
            return FileAccess.uriToBrowserUri(resources.joinPath(this.local.location, this.local.manifest.icon)).toString(true);
        }
        return null;
    }

    private get resourceExtensionIconUrl(): string | null {
        if (this.resourceExtension?.manifest.icon) {
            return FileAccess.uriToBrowserUri(resources.joinPath(this.resourceExtension.location, this.resourceExtension.manifest.icon)).toString(true);
        }
        return null;
    }

    private get galleryIconUrl(): string | null {
        return this.gallery?.assets.icon ? this.gallery.assets.icon.uri : null;
    }

    private get galleryIconUrlFallback(): string | null {
        return this.gallery?.assets.icon ? this.gallery.assets.icon.fallbackUri : null;
    }

    private get defaultIconUrl(): string {
        if (this.type === ExtensionType.System && this.local) {
            if (this.local.manifest && this.local.manifest.contributes) {
                if (Array.isArray(this.local.manifest.contributes.themes) && this.local.manifest.contributes.themes.length) {
                    return FileAccess.asBrowserUri('vs/workbench/contrib/extensions/browser/media/theme-icon.png').toString(true);
                }
                if (Array.isArray(this.local.manifest.contributes.grammars) && this.local.manifest.contributes.grammars.length) {
                    return FileAccess.asBrowserUri('vs/workbench/contrib/extensions/browser/media/language-icon.svg').toString(true);
                }
            }
        }
        return DefaultIconPath;
    }

    get repository(): string | undefined {
        return this.gallery && this.gallery.assets.repository ? this.gallery.assets.repository.uri : undefined;
    }

    get licenseUrl(): string | undefined {
        return this.gallery && this.gallery.assets.license ? this.gallery.assets.license.uri : undefined;
    }

    get supportUrl(): string | undefined {
        return this.gallery && this.gallery.supportLink ? this.gallery.supportLink : undefined;
    }

    get state(): ExtensionState {
        return this.stateProvider(this);
    }

    public isMalicious: boolean = false;
    public deprecationInfo: IDeprecationInfo | undefined;

    get installCount(): number | undefined {
        return this.gallery ? this.gallery.installCount : undefined;
    }

    get rating(): number | undefined {
        return this.gallery ? this.gallery.rating : undefined;
    }

    get ratingCount(): number | undefined {
        return this.gallery ? this.gallery.ratingCount : undefined;
    }

    get outdated(): boolean {
        try {
            if (!this.gallery || !this.local) {
                return false;
            }
            // Do not allow updating system extensions in stable
            if (this.type === ExtensionType.System && this.productService.quality === 'stable') {
                return false;
            }
            if (!this.local.preRelease && this.gallery.properties.isPreReleaseVersion) {
                return false;
            }
            if (semver.gt(this.latestVersion, this.version)) {
                return true;
            }
            if (this.outdatedTargetPlatform) {
                return true;
            }
        } catch (error) {
            /* Ignore */
        }
        return false;
    }

    get outdatedTargetPlatform(): boolean {
        return !!this.local && !!this.gallery
            && ![TargetPlatform.UNDEFINED, TargetPlatform.WEB].includes(this.local.targetPlatform)
            && this.gallery.properties.targetPlatform !== TargetPlatform.WEB
            && this.local.targetPlatform !== this.gallery.properties.targetPlatform
            && semver.eq(this.latestVersion, this.version);
    }

    get runtimeState(): ExtensionRuntimeState | undefined {
        return this.runtimeStateProvider(this);
    }

    get telemetryData(): any {
        const { local, gallery } = this;

        if (gallery) {
            return getGalleryExtensionTelemetryData(gallery);
        } else if (local) {
            return getLocalExtensionTelemetryData(local);
        } else {
            return {};
        }
    }

    get preview(): boolean {
        return this.local?.manifest.preview ?? this.gallery?.preview ?? false;
    }

    get preRelease(): boolean {
        return !!this.local?.preRelease;
    }

    get isPreReleaseVersion(): boolean {
        if (this.local) {
            return this.local.isPreReleaseVersion;
        }
        return !!this.gallery?.properties.isPreReleaseVersion;
    }

    get hasPreReleaseVersion(): boolean {
        return !!this.gallery?.hasPreReleaseVersion || !!this.local?.hasPreReleaseVersion;
    }

    get hasReleaseVersion(): boolean {
        return !!this.resourceExtension || !!this.gallery?.hasReleaseVersion;
    }

    private getLocal(): ILocalExtension | undefined {
        return this.local && !this.outdated ? this.local : undefined;
    }

    async getManifest(token: CancellationToken): Promise<IExtensionManifest | null> {
        const local = this.getLocal();
        if (local) {
            return local.manifest;
        }

        if (this.gallery) {
            if (this.gallery.assets.manifest) {
                return this.galleryService.getManifest(this.gallery, token);
            }
            this.logService.error(nls.localize('Manifest is not found', "Manifest is not found"), this.identifier.id);
            return null;
        }

        if (this.resourceExtension) {
            return this.resourceExtension.manifest;
        }

        return null;
    }

    hasReadme(): boolean {
        if (this.local && this.local.readmeUrl) {
            return true;
        }

        if (this.gallery && this.gallery.assets.readme) {
            return true;
        }

        if (this.resourceExtension?.readmeUri) {
            return true;
        }

        return this.type === ExtensionType.System;
    }

    async getReadme(token: CancellationToken): Promise<string> {
        const local = this.getLocal();
        if (local?.readmeUrl) {
            const content = await this.fileService.readFile(local.readmeUrl);
            return content.value.toString();
        }

        if (this.gallery) {
            if (this.gallery.assets.readme) {
                return this.galleryService.getReadme(this.gallery, token);
            }
            this.telemetryService.publicLog('extensions:NotFoundReadMe', this.telemetryData);
        }

        if (this.type === ExtensionType.System) {
            return Promise.resolve(`# ${this.displayName || this.name}
**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.
## Features
${this.description}
`);
        }

        if (this.resourceExtension?.readmeUri) {
            const content = await this.fileService.readFile(this.resourceExtension?.readmeUri);
            return content.value.toString();
        }

        return Promise.reject(new Error('not available'));
    }

    hasChangelog(): boolean {
        if (this.local && this.local.changelogUrl) {
            return true;
        }

        if (this.gallery && this.gallery.assets.changelog) {
            return true;
        }

        return this.type === ExtensionType.System;
    }

    async getChangelog(token: CancellationToken): Promise<string> {
        const local = this.getLocal();
        if (local?.changelogUrl) {
            const content = await this.fileService.readFile(local.changelogUrl);
            return content.value.toString();
        }

        if (this.gallery?.assets.changelog) {
            return this.galleryService.getChangelog(this.gallery, token);
        }

        if (this.type === ExtensionType.System) {
            return Promise.resolve(`Please check the [VS Code Release Notes](command:${ShowCurrentReleaseNotesActionId}) for changes to the built-in extensions.`);
        }

        return Promise.reject(new Error('not available'));
    }

    get categories(): readonly string[] {
        const { local, gallery, resourceExtension } = this;
        if (local && local.manifest.categories && !this.outdated) {
            return local.manifest.categories;
        }
        if (gallery) {
            return gallery.categories;
        }
        if (resourceExtension) {
            return resourceExtension.manifest.categories ?? [];
        }
        return [];
    }

    get tags(): readonly string[] {
        const { gallery } = this;
        if (gallery) {
            return gallery.tags.filter(tag => !tag.startsWith('_'));
        }
        return [];
    }

    get dependencies(): string[] {
        const { local, gallery, resourceExtension } = this;
        if (local && local.manifest.extensionDependencies && !this.outdated) {
            return local.manifest.extensionDependencies;
        }
        if (gallery) {
            return gallery.properties.dependencies || [];
        }
        if (resourceExtension) {
            return resourceExtension.manifest.extensionDependencies || [];
        }
        return [];
    }

    get extensionPack(): string[] {
        const { local, gallery, resourceExtension } = this;
        if (local && local.manifest.extensionPack && !this.outdated) {
            return local.manifest.extensionPack;
        }
        if (gallery) {
            return gallery.properties.extensionPack || [];
        }
        if (resourceExtension) {
            return resourceExtension.manifest.extensionPack || [];
        }
        return [];
    }

    private getManifestFromLocalOrResource(): IExtensionManifest | null {
        if (this.local) {
            return this.local.manifest;
        }
        if (this.resourceExtension) {
            return this.resourceExtension.manifest;
        }
        return null;
    }
}

