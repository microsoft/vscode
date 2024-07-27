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
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { fromNow } from 'vs/base/common/date';
import { memoize } from 'vs/base/common/decorators';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import 'vs/css!./media/runtimeExtensionsEditor';
import * as nls from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ExtensionIdentifier, ExtensionIdentifierMap, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
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
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { DefaultIconPath, EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { LocalWebWorkerRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { IExtensionHostProfile, IExtensionService, IExtensionsStatus } from 'vs/workbench/services/extensions/common/extensions';

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
