/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/runtimeExtensionsEditor';
import * as nls from 'vs/nls';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/contrib/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService, IExtensionsStatus, IExtensionHostProfile } from 'vs/workbench/services/extensions/common/extensions';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { append, $, reset, Dimension, clearNode } from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { EnablementState } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { memoize } from 'vs/base/common/decorators';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ILabelService } from 'vs/platform/label/common/label';
import { renderCodicons } from 'vs/base/browser/codicons';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Schemas } from 'vs/base/common/network';
import { SlowExtensionAction } from 'vs/workbench/contrib/extensions/electron-browser/extensionsSlowActions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { domEvent } from 'vs/base/browser/event';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ReportExtensionIssueAction } from 'vs/workbench/contrib/extensions/electron-browser/reportExtensionIssueAction';
import { SaveExtensionHostProfileAction } from './saveExtensionHostProfileAction';

export const IExtensionHostProfileService = createDecorator<IExtensionHostProfileService>('extensionHostProfileService');
export const CONTEXT_PROFILE_SESSION_STATE = new RawContextKey<string>('profileSessionState', 'none');
export const CONTEXT_EXTENSION_HOST_PROFILE_RECORDED = new RawContextKey<boolean>('extensionHostProfileRecorded', false);

export enum ProfileSessionState {
	None = 0,
	Starting = 1,
	Running = 2,
	Stopping = 3
}

export interface IExtensionHostProfileService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<void>;
	readonly onDidChangeLastProfile: Event<void>;

	readonly state: ProfileSessionState;
	readonly lastProfile: IExtensionHostProfile | null;

	startProfiling(): void;
	stopProfiling(): void;

	getUnresponsiveProfile(extensionId: ExtensionIdentifier): IExtensionHostProfile | undefined;
	setUnresponsiveProfile(extensionId: ExtensionIdentifier, profile: IExtensionHostProfile): void;
}

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

interface IRuntimeExtension {
	originalIndex: number;
	description: IExtensionDescription;
	marketplaceInfo: IExtension;
	status: IExtensionsStatus;
	profileInfo?: IExtensionProfileInformation;
	unresponsiveProfile?: IExtensionHostProfile;
}

export class RuntimeExtensionsEditor extends EditorPane {

	public static readonly ID: string = 'workbench.editor.runtimeExtensions';

	private _list: WorkbenchList<IRuntimeExtension> | null;
	private _profileInfo: IExtensionHostProfile | null;
	private _elements: IRuntimeExtension[] | null;
	private _updateSoon: RunOnceScheduler;
	private _profileSessionState: IContextKey<string>;
	private _extensionsHostRecorded: IContextKey<boolean>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
		@IStorageService storageService: IStorageService,
		@ILabelService private readonly _labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super(RuntimeExtensionsEditor.ID, telemetryService, themeService, storageService);

		this._list = null;
		this._profileInfo = this._extensionHostProfileService.lastProfile;
		this._elements = null;
		this._updateSoon = this._register(new RunOnceScheduler(() => this._updateExtensions(), 200));
		this._profileSessionState = CONTEXT_PROFILE_SESSION_STATE.bindTo(contextKeyService);
		this._extensionsHostRecorded = CONTEXT_EXTENSION_HOST_PROFILE_RECORDED.bindTo(contextKeyService);

		this._register(this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this._profileInfo = this._extensionHostProfileService.lastProfile;
			this._extensionsHostRecorded.set(!!this._profileInfo);
			this._updateExtensions();
		}));
		this._register(this._extensionHostProfileService.onDidChangeState(() => {
			const state = this._extensionHostProfileService.state;
			this._profileSessionState.set(ProfileSessionState[state].toLowerCase());
		}));
		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateSoon.schedule()));

		this._updateExtensions();
	}

	private async _updateExtensions(): Promise<void> {
		this._elements = await this._resolveExtensions();
		if (this._list) {
			this._list.splice(0, this._list.length, this._elements);
		}
	}

	private async _resolveExtensions(): Promise<IRuntimeExtension[]> {
		// We only deal with extensions with source code!
		const extensionsDescriptions = (await this._extensionService.getExtensions()).filter((extension) => {
			return Boolean(extension.main) || Boolean(extension.browser);
		});
		let marketplaceMap: { [id: string]: IExtension; } = Object.create(null);
		const marketPlaceExtensions = await this._extensionsWorkbenchService.queryLocal();
		for (let extension of marketPlaceExtensions) {
			marketplaceMap[ExtensionIdentifier.toKey(extension.identifier.id)] = extension;
		}

		let statusMap = this._extensionService.getExtensionsStatus();

		// group profile segments by extension
		let segments: { [id: string]: number[]; } = Object.create(null);

		if (this._profileInfo) {
			let currentStartTime = this._profileInfo.startTime;
			for (let i = 0, len = this._profileInfo.deltas.length; i < len; i++) {
				const id = this._profileInfo.ids[i];
				const delta = this._profileInfo.deltas[i];

				let extensionSegments = segments[ExtensionIdentifier.toKey(id)];
				if (!extensionSegments) {
					extensionSegments = [];
					segments[ExtensionIdentifier.toKey(id)] = extensionSegments;
				}

				extensionSegments.push(currentStartTime);
				currentStartTime = currentStartTime + delta;
				extensionSegments.push(currentStartTime);
			}
		}

		let result: IRuntimeExtension[] = [];
		for (let i = 0, len = extensionsDescriptions.length; i < len; i++) {
			const extensionDescription = extensionsDescriptions[i];

			let profileInfo: IExtensionProfileInformation | null = null;
			if (this._profileInfo) {
				let extensionSegments = segments[ExtensionIdentifier.toKey(extensionDescription.identifier)] || [];
				let extensionTotalTime = 0;
				for (let j = 0, lenJ = extensionSegments.length / 2; j < lenJ; j++) {
					const startTime = extensionSegments[2 * j];
					const endTime = extensionSegments[2 * j + 1];
					extensionTotalTime += (endTime - startTime);
				}
				profileInfo = {
					segments: extensionSegments,
					totalTime: extensionTotalTime
				};
			}

			result[i] = {
				originalIndex: i,
				description: extensionDescription,
				marketplaceInfo: marketplaceMap[ExtensionIdentifier.toKey(extensionDescription.identifier)],
				status: statusMap[extensionDescription.identifier.value],
				profileInfo: profileInfo || undefined,
				unresponsiveProfile: this._extensionHostProfileService.getUnresponsiveProfile(extensionDescription.identifier)
			};
		}

		result = result.filter(element => element.status.activationTimes);

		// bubble up extensions that have caused slowness

		const isUnresponsive = (extension: IRuntimeExtension): boolean =>
			extension.unresponsiveProfile === this._profileInfo;

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

		const delegate = new class implements IListVirtualDelegate<IRuntimeExtension>{
			getHeight(element: IRuntimeExtension): number {
				return 62;
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

				const actionbar = new ActionBar(desc, { animated: false });
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

				const onError = Event.once(domEvent(data.icon, 'error'));
				onError(() => data.icon.src = element.marketplaceInfo.iconUrlFallback, null, data.elementDisposables);
				data.icon.src = element.marketplaceInfo.iconUrl;

				if (!data.icon.complete) {
					data.icon.style.visibility = 'hidden';
					data.icon.onload = () => data.icon.style.visibility = 'inherit';
				} else {
					data.icon.style.visibility = 'inherit';
				}
				data.name.textContent = element.marketplaceInfo.displayName;
				data.version.textContent = element.description.version;

				const activationTimes = element.status.activationTimes!;
				let syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
				data.activationTime.textContent = activationTimes.activationReason.startup ? `Startup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;

				data.actionbar.clear();
				if (element.unresponsiveProfile) {
					data.actionbar.push(this._instantiationService.createInstance(SlowExtensionAction, element.description, element.unresponsiveProfile), { icon: true, label: true });
				}
				if (isNonEmptyArray(element.status.runtimeErrors)) {
					data.actionbar.push(this._instantiationService.createInstance(ReportExtensionIssueAction, element), { icon: true, label: true });
				}

				let title: string;
				const activationId = activationTimes.activationReason.extensionId.value;
				const activationEvent = activationTimes.activationReason.activationEvent;
				if (activationEvent === '*') {
					title = nls.localize('starActivation', "Activated by {0} on start-up", activationId);
				} else if (/^workspaceContains:/.test(activationEvent)) {
					let fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
					if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
						title = nls.localize({
							key: 'workspaceContainsGlobActivation',
							comment: [
								'{0} will be a glob pattern'
							]
						}, "Activated by {1} because a file matching {1} exists in your workspace", fileNameOrGlob, activationId);
					} else {
						title = nls.localize({
							key: 'workspaceContainsFileActivation',
							comment: [
								'{0} will be a file name'
							]
						}, "Activated by {1} because file {0} exists in your workspace", fileNameOrGlob, activationId);
					}
				} else if (/^workspaceContainsTimeout:/.test(activationEvent)) {
					const glob = activationEvent.substr('workspaceContainsTimeout:'.length);
					title = nls.localize({
						key: 'workspaceContainsTimeout',
						comment: [
							'{0} will be a glob pattern'
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
					let language = activationEvent.substr('onLanguage:'.length);
					title = nls.localize('languageActivation', "Activated by {1} because you opened a {0} file", language, activationId);
				} else {
					title = nls.localize({
						key: 'workspaceGenericActivation',
						comment: [
							'The {0} placeholder will be an activation event, like e.g. \'language:typescript\', \'debug\', etc.'
						]
					}, "Activated by {1} on {0}", activationEvent, activationId);
				}
				data.activationTime.title = title;

				clearNode(data.msgContainer);

				if (this._extensionHostProfileService.getUnresponsiveProfile(element.description.identifier)) {
					const el = $('span', undefined, ...renderCodicons(` $(alert) Unresponsive`));
					el.title = nls.localize('unresponsive.title', "Extension has caused the extension host to freeze.");
					data.msgContainer.appendChild(el);
				}

				if (isNonEmptyArray(element.status.runtimeErrors)) {
					const el = $('span', undefined, ...renderCodicons(`$(bug) ${nls.localize('errors', "{0} uncaught errors", element.status.runtimeErrors.length)}`));
					data.msgContainer.appendChild(el);
				}

				if (element.status.messages && element.status.messages.length > 0) {
					const el = $('span', undefined, ...renderCodicons(`$(alert) ${element.status.messages[0].message}`));
					data.msgContainer.appendChild(el);
				}

				if (element.description.extensionLocation.scheme !== Schemas.file) {
					const el = $('span', undefined, ...renderCodicons(`$(remote) ${element.description.extensionLocation.authority}`));
					data.msgContainer.appendChild(el);

					const hostLabel = this._labelService.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
					if (hostLabel) {
						reset(el, ...renderCodicons(`$(remote) ${hostLabel}`));
					}
				}

				if (this._profileInfo && element.profileInfo) {
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
			accessibilityProvider: new RuntimeExtensionsEditorAccessibilityProvider()
		});

		this._list.splice(0, this._list.length, this._elements || undefined);

		this._list.onContextMenu((e) => {
			if (!e.element) {
				return;
			}

			const actions: IAction[] = [];

			actions.push(this._instantiationService.createInstance(ReportExtensionIssueAction, e.element));
			actions.push(new Separator());

			actions.push(new Action('runtimeExtensionsEditor.action.disableWorkspace', nls.localize('disable workspace', "Disable (Workspace)"), undefined, true, () => this._extensionsWorkbenchService.setEnablement(e.element!.marketplaceInfo, EnablementState.DisabledWorkspace)));
			actions.push(new Action('runtimeExtensionsEditor.action.disable', nls.localize('disable', "Disable"), undefined, true, () => this._extensionsWorkbenchService.setEnablement(e.element!.marketplaceInfo, EnablementState.DisabledGlobally)));
			actions.push(new Separator());

			const state = this._extensionHostProfileService.state;
			if (state === ProfileSessionState.Running) {
				actions.push(this._instantiationService.createInstance(StopExtensionHostProfileAction, StopExtensionHostProfileAction.ID, StopExtensionHostProfileAction.LABEL));
			} else {
				actions.push(this._instantiationService.createInstance(StartExtensionHostProfileAction, StartExtensionHostProfileAction.ID, StartExtensionHostProfileAction.LABEL));
			}
			actions.push(this.saveExtensionHostProfileAction);

			this._contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions
			});
		});
	}

	@memoize
	private get saveExtensionHostProfileAction(): IAction {
		return this._instantiationService.createInstance(SaveExtensionHostProfileAction, SaveExtensionHostProfileAction.ID, SaveExtensionHostProfileAction.LABEL);
	}

	public layout(dimension: Dimension): void {
		if (this._list) {
			this._list.layout(dimension.height);
		}
	}
}

export class ShowRuntimeExtensionsAction extends Action {
	static readonly ID = 'workbench.action.showRuntimeExtensions';
	static readonly LABEL = nls.localize('showRuntimeExtensions', "Show Running Extensions");

	constructor(
		id: string, label: string,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super(id, label);
	}

	public async run(e?: any): Promise<any> {
		await this._editorService.openEditor(RuntimeExtensionsInput.instance, { revealIfOpened: true, pinned: true });
	}
}

export class StartExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.extensionHostProfile';
	static readonly LABEL = nls.localize('extensionHostProfileStart', "Start Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this._extensionHostProfileService.startProfiling();
		return Promise.resolve();
	}
}

export class StopExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.stopExtensionHostProfile';
	static readonly LABEL = nls.localize('stopExtensionHostProfileStart', "Stop Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this._extensionHostProfileService.stopProfiling();
		return Promise.resolve();
	}
}

class RuntimeExtensionsEditorAccessibilityProvider implements IListAccessibilityProvider<IRuntimeExtension> {
	getWidgetAriaLabel(): string {
		return nls.localize('runtimeExtensions', "Runtime Extensions");
	}

	getAriaLabel(element: IRuntimeExtension): string | null {
		return element.description.name;
	}
}
