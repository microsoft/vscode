/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/runtimeExtensionsEditor';
import * as nls from 'vs/nls';
import * as os from 'os';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { Action, IAction } from 'vs/base/common/actions';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionsWorkbenchService, IExtension } from 'vs/workbench/parts/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService, IExtensionDescription, IExtensionsStatus, IExtensionHostProfile } from 'vs/workbench/services/extensions/common/extensions';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { append, $, addClass, toggleClass, Dimension } from 'vs/base/browser/dom';
import { ActionBar, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { RunOnceScheduler } from 'vs/base/common/async';
import { clipboard } from 'electron';
import { LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { writeFile } from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { memoize } from 'vs/base/common/decorators';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { DisableForWorkspaceAction, DisableGloballyAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { RuntimeExtensionsInput } from 'vs/workbench/services/extensions/electron-browser/runtimeExtensionsInput';
import { IDebugService } from 'vs/workbench/parts/debug/common/debug';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { randomPort } from 'vs/base/node/ports';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService } from 'vs/platform/storage/common/storage';

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
	_serviceBrand: any;

	readonly onDidChangeState: Event<void>;
	readonly onDidChangeLastProfile: Event<void>;

	readonly state: ProfileSessionState;
	readonly lastProfile: IExtensionHostProfile;

	startProfiling(): void;
	stopProfiling(): void;

	clearLastProfile(): void;
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
	profileInfo: IExtensionProfileInformation;
}

export class RuntimeExtensionsEditor extends BaseEditor {

	public static readonly ID: string = 'workbench.editor.runtimeExtensions';

	private _list: WorkbenchList<IRuntimeExtension>;
	private _profileInfo: IExtensionHostProfile;

	private _elements: IRuntimeExtension[];
	private _extensionsDescriptions: IExtensionDescription[];
	private _updateSoon: RunOnceScheduler;
	private _profileSessionState: IContextKey<string>;
	private _extensionsHostRecoded: IContextKey<boolean>;

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
		@IStorageService storageService: IStorageService
	) {
		super(RuntimeExtensionsEditor.ID, telemetryService, themeService, storageService);

		this._list = null;
		this._profileInfo = this._extensionHostProfileService.lastProfile;
		this._register(this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this._profileInfo = this._extensionHostProfileService.lastProfile;
			this._extensionsHostRecoded.set(!!this._profileInfo);
			this._updateExtensions();
		}));
		this._extensionHostProfileService.onDidChangeState(() => {
			const state = this._extensionHostProfileService.state;

			this._profileSessionState.set(ProfileSessionState[state].toLowerCase());
		});

		this._elements = null;

		this._extensionsDescriptions = [];
		this._updateExtensions();

		this._profileSessionState = CONTEXT_PROFILE_SESSION_STATE.bindTo(contextKeyService);
		this._extensionsHostRecoded = CONTEXT_EXTENSION_HOST_PROFILE_RECORDED.bindTo(contextKeyService);

		this._updateSoon = this._register(new RunOnceScheduler(() => this._updateExtensions(), 200));

		this._extensionService.getExtensions().then((extensions) => {
			// We only deal with extensions with source code!
			this._extensionsDescriptions = extensions.filter((extension) => {
				return !!extension.main;
			});
			this._updateExtensions();
		});
		this._register(this._extensionService.onDidChangeExtensionsStatus(() => this._updateSoon.schedule()));
	}

	private _updateExtensions(): void {
		this._elements = this._resolveExtensions();
		if (this._list) {
			this._list.splice(0, this._list.length, this._elements);
		}
	}

	private _resolveExtensions(): IRuntimeExtension[] {
		let marketplaceMap: { [id: string]: IExtension; } = Object.create(null);
		for (let extension of this._extensionsWorkbenchService.local) {
			marketplaceMap[extension.id] = extension;
		}

		let statusMap = this._extensionService.getExtensionsStatus();

		// group profile segments by extension
		let segments: { [id: string]: number[]; } = Object.create(null);

		if (this._profileInfo) {
			let currentStartTime = this._profileInfo.startTime;
			for (let i = 0, len = this._profileInfo.deltas.length; i < len; i++) {
				const id = this._profileInfo.ids[i];
				const delta = this._profileInfo.deltas[i];

				let extensionSegments = segments[id];
				if (!extensionSegments) {
					extensionSegments = [];
					segments[id] = extensionSegments;
				}

				extensionSegments.push(currentStartTime);
				currentStartTime = currentStartTime + delta;
				extensionSegments.push(currentStartTime);
			}
		}

		let result: IRuntimeExtension[] = [];
		for (let i = 0, len = this._extensionsDescriptions.length; i < len; i++) {
			const extensionDescription = this._extensionsDescriptions[i];

			let profileInfo: IExtensionProfileInformation | null = null;
			if (this._profileInfo) {
				let extensionSegments = segments[extensionDescription.id] || [];
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
				marketplaceInfo: marketplaceMap[extensionDescription.id],
				status: statusMap[extensionDescription.id],
				profileInfo: profileInfo
			};
		}

		result = result.filter((element) => element.status.activationTimes);

		if (this._profileInfo) {
			// sort descending by time spent in the profiler
			result = result.sort((a, b) => {
				if (a.profileInfo.totalTime === b.profileInfo.totalTime) {
					return a.originalIndex - b.originalIndex;
				}
				return b.profileInfo.totalTime - a.profileInfo.totalTime;
			});
		}

		return result;
	}

	protected createEditor(parent: HTMLElement): void {
		addClass(parent, 'runtime-extensions-editor');

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
			name: HTMLElement;

			activationTime: HTMLElement;
			profileTime: HTMLElement;

			profileTimeline: HTMLElement;

			msgIcon: HTMLElement;
			msgLabel: HTMLElement;

			actionbar: ActionBar;
			disposables: IDisposable[];
			elementDisposables: IDisposable[];
		}

		const renderer: IListRenderer<IRuntimeExtension, IRuntimeExtensionTemplateData> = {
			templateId: TEMPLATE_ID,
			renderTemplate: (root: HTMLElement): IRuntimeExtensionTemplateData => {
				const element = append(root, $('.extension'));

				const desc = append(element, $('div.desc'));
				const name = append(desc, $('div.name'));

				const msgContainer = append(desc, $('div.msg'));
				const msgIcon = append(msgContainer, $('.'));
				const msgLabel = append(msgContainer, $('span.msg-label'));

				const timeContainer = append(element, $('.time'));
				const activationTime = append(timeContainer, $('div.activation-time'));
				const profileTime = append(timeContainer, $('div.profile-time'));

				const profileTimeline = append(element, $('div.profile-timeline'));

				const actionbar = new ActionBar(element, {
					animated: false
				});
				actionbar.onDidRun(({ error }) => error && this._notificationService.error(error));
				actionbar.push(new ReportExtensionIssueAction(), { icon: true, label: true });

				const disposables = [actionbar];

				return {
					root,
					element,
					name,
					actionbar,
					activationTime,
					profileTime,
					profileTimeline,
					msgIcon,
					msgLabel,
					disposables,
					elementDisposables: []
				};
			},

			renderElement: (element: IRuntimeExtension, index: number, data: IRuntimeExtensionTemplateData): void => {

				data.elementDisposables = dispose(data.elementDisposables);

				toggleClass(data.root, 'odd', index % 2 === 1);

				data.name.textContent = element.marketplaceInfo ? element.marketplaceInfo.displayName : element.description.displayName;

				const activationTimes = element.status.activationTimes;
				let syncTime = activationTimes.codeLoadingTime + activationTimes.activateCallTime;
				data.activationTime.textContent = activationTimes.startup ? `Startup Activation: ${syncTime}ms` : `Activation: ${syncTime}ms`;
				data.actionbar.context = element;
				toggleClass(data.actionbar.getContainer(), 'hidden', element.marketplaceInfo && element.marketplaceInfo.type === LocalExtensionType.User && (!element.description.repository || !element.description.repository.url));

				let title: string;
				if (activationTimes.activationEvent === '*') {
					title = nls.localize('starActivation', "Activated on start-up");
				} else if (/^workspaceContains:/.test(activationTimes.activationEvent)) {
					let fileNameOrGlob = activationTimes.activationEvent.substr('workspaceContains:'.length);
					if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
						title = nls.localize({
							key: 'workspaceContainsGlobActivation',
							comment: [
								'{0} will be a glob pattern'
							]
						}, "Activated because a file matching {0} exists in your workspace", fileNameOrGlob);
					} else {
						title = nls.localize({
							key: 'workspaceContainsFileActivation',
							comment: [
								'{0} will be a file name'
							]
						}, "Activated because file {0} exists in your workspace", fileNameOrGlob);
					}
				} else if (/^workspaceContainsTimeout:/.test(activationTimes.activationEvent)) {
					const glob = activationTimes.activationEvent.substr('workspaceContainsTimeout:'.length);
					title = nls.localize({
						key: 'workspaceContainsTimeout',
						comment: [
							'{0} will be a glob pattern'
						]
					}, "Activated because searching for {0} took too long", glob);
				} else if (/^onLanguage:/.test(activationTimes.activationEvent)) {
					let language = activationTimes.activationEvent.substr('onLanguage:'.length);
					title = nls.localize('languageActivation', "Activated because you opened a {0} file", language);
				} else {
					title = nls.localize({
						key: 'workspaceGenericActivation',
						comment: [
							'The {0} placeholder will be an activation event, like e.g. \'language:typescript\', \'debug\', etc.'
						]
					}, "Activated on {0}", activationTimes.activationEvent);
				}
				data.activationTime.title = title;
				if (!isFalsyOrEmpty(element.status.runtimeErrors)) {
					data.msgIcon.className = 'octicon octicon-bug';
					data.msgLabel.textContent = nls.localize('errors', "{0} uncaught errors", element.status.runtimeErrors.length);
				} else if (element.status.messages && element.status.messages.length > 0) {
					data.msgIcon.className = 'octicon octicon-alert';
					data.msgLabel.textContent = element.status.messages[0].message;
				} else {
					data.msgIcon.className = '';
					data.msgLabel.textContent = '';
				}

				if (this._profileInfo) {
					data.profileTime.textContent = `Profile: ${(element.profileInfo.totalTime / 1000).toFixed(2)}ms`;
					const elementSegments = element.profileInfo.segments;
					let inner = '<rect x="0" y="99" width="100" height="1" />';
					for (let i = 0, len = elementSegments.length / 2; i < len; i++) {
						const absoluteStart = elementSegments[2 * i];
						const absoluteEnd = elementSegments[2 * i + 1];

						const start = absoluteStart - this._profileInfo.startTime;
						const end = absoluteEnd - this._profileInfo.startTime;

						const absoluteDuration = this._profileInfo.endTime - this._profileInfo.startTime;

						const xStart = start / absoluteDuration * 100;
						const xEnd = end / absoluteDuration * 100;

						inner += `<rect x="${xStart}" y="0" width="${xEnd - xStart}" height="100" />`;
					}
					let svg = `<svg class="profile-timeline-svg" preserveAspectRatio="none" height="16" viewBox="0 0 100 100">${inner}</svg>`;

					data.profileTimeline.innerHTML = svg;
					data.profileTimeline.style.display = 'inherit';
				} else {
					data.profileTime.textContent = '';
					data.profileTimeline.innerHTML = '';
				}
			},

			disposeElement: () => null,

			disposeTemplate: (data: IRuntimeExtensionTemplateData): void => {
				data.disposables = dispose(data.disposables);
			}
		};

		this._list = this._instantiationService.createInstance(WorkbenchList, parent, delegate, [renderer], {
			multipleSelectionSupport: false,
			setRowLineHeight: false
		}) as WorkbenchList<IRuntimeExtension>;

		this._list.splice(0, this._list.length, this._elements);

		this._list.onContextMenu((e) => {
			const actions: IAction[] = [];

			if (e.element.marketplaceInfo && e.element.marketplaceInfo.type === LocalExtensionType.User) {
				actions.push(this._instantiationService.createInstance(DisableForWorkspaceAction, DisableForWorkspaceAction.LABEL));
				actions.push(this._instantiationService.createInstance(DisableGloballyAction, DisableGloballyAction.LABEL));
				actions.forEach((a: DisableForWorkspaceAction | DisableGloballyAction) => a.extension = e.element.marketplaceInfo);
				actions.push(new Separator());
			}
			const state = this._extensionHostProfileService.state;
			if (state === ProfileSessionState.Running) {
				actions.push(this._instantiationService.createInstance(StopExtensionHostProfileAction, StopExtensionHostProfileAction.ID, StopExtensionHostProfileAction.LABEL));
			} else {
				actions.push(this._instantiationService.createInstance(StartExtensionHostProfileAction, StartExtensionHostProfileAction.ID, StartExtensionHostProfileAction.LABEL));
			}
			actions.push(this.saveExtensionHostProfileAction);

			this._contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => Promise.resolve(actions)
			});
		});
	}

	@memoize
	private get saveExtensionHostProfileAction(): IAction {
		return this._instantiationService.createInstance(SaveExtensionHostProfileAction, SaveExtensionHostProfileAction.ID, SaveExtensionHostProfileAction.LABEL);
	}

	public layout(dimension: Dimension): void {
		this._list.layout(dimension.height);
	}
}

export class ShowRuntimeExtensionsAction extends Action {
	static readonly ID = 'workbench.action.showRuntimeExtensions';
	static LABEL = nls.localize('showRuntimeExtensions', "Show Running Extensions");

	constructor(
		id: string, label: string,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public async run(e?: any): Promise<any> {
		await this._editorService.openEditor(this._instantiationService.createInstance(RuntimeExtensionsInput), { revealIfOpened: true });
	}
}

class ReportExtensionIssueAction extends Action {
	static readonly ID = 'workbench.extensions.action.reportExtensionIssue';
	static LABEL = nls.localize('reportExtensionIssue', "Report Issue");

	constructor(
		id: string = ReportExtensionIssueAction.ID, label: string = ReportExtensionIssueAction.LABEL
	) {
		super(id, label, 'extension-action report-issue');
	}

	run(extension: IRuntimeExtension): Promise<any> {
		clipboard.writeText('```json \n' + JSON.stringify(extension.status, null, '\t') + '\n```');
		window.open(this.generateNewIssueUrl(extension));

		return Promise.resolve(null);
	}

	private generateNewIssueUrl(extension: IRuntimeExtension): string {
		let baseUrl = extension.marketplaceInfo && extension.marketplaceInfo.type === LocalExtensionType.User && extension.description.repository ? extension.description.repository.url : undefined;
		if (!!baseUrl) {
			baseUrl = `${baseUrl.indexOf('.git') !== -1 ? baseUrl.substr(0, baseUrl.length - 4) : baseUrl}/issues/new/`;
		} else {
			baseUrl = product.reportIssueUrl;
		}

		const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- Extension Name: ${extension.description.name}
- Extension Version: ${extension.description.version}
- OS Version: ${osVersion}
- VSCode version: ${pkg.version}` + '\n\n We have written the needed data into your clipboard. Please paste:'
		);

		return `${baseUrl}${queryStringPrefix}body=${body}`;
	}
}

export class DebugExtensionHostAction extends Action {
	static readonly ID = 'workbench.extensions.action.debugExtensionHost';
	static LABEL = nls.localize('debugExtensionHost', "Start Debugging Extension Host");
	static CSS_CLASS = 'debug-extension-host';

	constructor(
		@IDebugService private readonly _debugService: IDebugService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
	) {
		super(DebugExtensionHostAction.ID, DebugExtensionHostAction.LABEL, DebugExtensionHostAction.CSS_CLASS);
	}

	async run(): Promise<any> {

		const inspectPort = this._extensionService.getInspectPort();
		if (!inspectPort) {
			const res = await this._dialogService.confirm({
				type: 'info',
				message: nls.localize('restart1', "Profile Extensions"),
				detail: nls.localize('restart2', "In order to profile extensions a restart is required. Do you want to restart '{0}' now?", product.nameLong),
				primaryButton: nls.localize('restart3', "Restart"),
				secondaryButton: nls.localize('cancel', "Cancel")
			});
			if (res.confirmed) {
				this._windowsService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
			}
		}

		return this._debugService.startDebugging(null, {
			type: 'node',
			request: 'attach',
			port: inspectPort
		});
	}
}

export class StartExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.extensionHostProfile';
	static LABEL = nls.localize('extensionHostProfileStart', "Start Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this._extensionHostProfileService.startProfiling();
		return Promise.resolve(null);
	}
}

export class StopExtensionHostProfileAction extends Action {
	static readonly ID = 'workbench.extensions.action.stopExtensionHostProfile';
	static LABEL = nls.localize('stopExtensionHostProfileStart', "Stop Extension Host Profile");

	constructor(
		id: string = StartExtensionHostProfileAction.ID, label: string = StartExtensionHostProfileAction.LABEL,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label);
	}

	run(): Promise<any> {
		this._extensionHostProfileService.stopProfiling();
		return Promise.resolve(null);
	}
}

export class SaveExtensionHostProfileAction extends Action {

	static LABEL = nls.localize('saveExtensionHostProfile', "Save Extension Host Profile");
	static readonly ID = 'workbench.extensions.action.saveExtensionHostProfile';

	constructor(
		id: string = SaveExtensionHostProfileAction.ID, label: string = SaveExtensionHostProfileAction.LABEL,
		@IWindowService private readonly _windowService: IWindowService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IExtensionHostProfileService private readonly _extensionHostProfileService: IExtensionHostProfileService,
	) {
		super(id, label, undefined, false);
		this._extensionHostProfileService.onDidChangeLastProfile(() => {
			this.enabled = (this._extensionHostProfileService.lastProfile !== null);
		});
	}

	run(): Promise<any> {
		return Promise.resolve(this._asyncRun());
	}

	private async _asyncRun(): Promise<any> {
		let picked = await this._windowService.showSaveDialog({
			title: 'Save Extension Host Profile',
			buttonLabel: 'Save',
			defaultPath: `CPU-${new Date().toISOString().replace(/[\-:]/g, '')}.cpuprofile`,
			filters: [{
				name: 'CPU Profiles',
				extensions: ['cpuprofile', 'txt']
			}]
		});

		if (!picked) {
			return;
		}

		const profileInfo = this._extensionHostProfileService.lastProfile;
		let dataToWrite: object = profileInfo.data;

		if (this._environmentService.isBuilt) {
			const profiler = await import('v8-inspect-profiler');
			// when running from a not-development-build we remove
			// absolute filenames because we don't want to reveal anything
			// about users. We also append the `.txt` suffix to make it
			// easier to attach these files to GH issues

			let tmp = profiler.rewriteAbsolutePaths({ profile: dataToWrite }, 'piiRemoved');
			dataToWrite = tmp.profile;

			picked = picked + '.txt';
		}

		return writeFile(picked, JSON.stringify(profileInfo.data, null, '\t'));
	}
}
