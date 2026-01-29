/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import * as arrays from '../../../../base/common/arrays.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { Disposable, } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { GettingStartedEditorOptions, GettingStartedInput, gettingStartedInputTypeId } from './gettingStartedInput.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { TerminalCommandId } from '../../terminal/common/terminal.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarMaximizedContext, StartupEditorLoadingContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { AgentSessionsWelcomePage } from '../../welcomeAgentSessions/browser/agentSessionsWelcome.js';
import { timeout } from '../../../../base/common/async.js';

export const restoreWalkthroughsConfigurationKey = 'workbench.welcomePage.restorableWalkthroughs';
export type RestoreWalkthroughsConfigurationValue = { folder: string; category?: string; step?: string };

const configurationKey = 'workbench.startupEditor';
const telemetryOptOutStorageKey = 'workbench.telemetryOptOutShown';

export class StartupPageEditorResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.startupPageEditorResolver';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService editorResolverService: IEditorResolverService
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${GettingStartedInput.RESOURCE.scheme}:/**`,
			{
				id: GettingStartedInput.ID,
				label: localize('welcome.displayName', "Welcome Page"),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => uri.scheme === GettingStartedInput.RESOURCE.scheme,
			},
			{
				createEditorInput: ({ options }) => {
					return {
						editor: this.instantiationService.createInstance(GettingStartedInput, options as GettingStartedEditorOptions),
						options: {
							...options,
							pinned: false
						}
					};
				}
			}
		));
	}
}

export class StartupPageRunnerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.startupPageRunner';
	private readonly startupEditorLoadingContextKey: IContextKey<boolean>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IProductService private readonly productService: IProductService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		// Bind the loading context key and set to true - watermark will show loading state
		// until the startup editor value is resolved
		this.startupEditorLoadingContextKey = StartupEditorLoadingContext.bindTo(this.contextKeyService);
		this.startupEditorLoadingContextKey.set(true);

		this.run()
			.finally(() => {
				if (this.startupEditorLoadingContextKey.get()) {
					this.startupEditorLoadingContextKey.set(false);
				}
			})
			.then(undefined, onUnexpectedError);
		this._register(this.editorService.onDidCloseEditor((e) => {
			if (e.editor instanceof GettingStartedInput) {
				e.editor.selectedCategory = undefined;
				e.editor.selectedStep = undefined;
			}
		}));
	}

	private async run() {

		// Wait for resolving startup editor until we are restored to reduce startup pressure
		await this.lifecycleService.when(LifecyclePhase.Restored);

		if (AuxiliaryBarMaximizedContext.getValue(this.contextKeyService)) {
			// If the auxiliary bar is maximized, we do not show the welcome page.
			return;
		}

		// Always open Welcome page for first-launch, no matter what is open or which startupEditor is set.
		if (
			this.productService.enableTelemetry
			&& this.productService.showTelemetryOptOut
			&& getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE
			&& !this.environmentService.skipWelcome
			&& !this.storageService.get(telemetryOptOutStorageKey, StorageScope.PROFILE)
		) {
			this.storageService.store(telemetryOptOutStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
		}

		if (this.tryOpenWalkthroughForFolder()) {
			return;
		}

		const startupEditorValue = await this.getStartupEditorValue();
		const enabled = isStartupPageEnabled(startupEditorValue, this.contextService, this.environmentService);
		const hasPrefillData = !!this.storageService.get('chat.welcomeViewPrefill', StorageScope.APPLICATION);

		if (enabled) {
			if (startupEditorValue === 'agentSessionsWelcomePage') {
				if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors || hasPrefillData) {
					await this.openAgentSessionsWelcome();
				}
			} else if (this.lifecycleService.startupKind !== StartupKind.ReloadedWindow && (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors)) {
				if (startupEditorValue === 'readme') {
					await this.openReadme();
				} else if (startupEditorValue === 'welcomePage' || startupEditorValue === 'welcomePageInEmptyWorkbench') {
					await this.openGettingStarted(true);
				} else if (startupEditorValue === 'terminal') {
					this.commandService.executeCommand(TerminalCommandId.CreateTerminalEditor);
				}
			}
		}
	}

	private async getStartupEditorValue(): Promise<string | undefined> {
		const startupEditorConfig = this.configurationService.inspect<string>(configurationKey);

		// If user has explicitly set a value, use it
		if (isConfigured(startupEditorConfig)) {
			this.startupEditorLoadingContextKey.set(false);
			return startupEditorConfig.value;
		}

		try {
			// Race the experiment service against a timeout to avoid blocking startup
			const timedOut = { value: false };
			const experimentValue = await Promise.race([
				this.experimentService.getTreatment<string>('config.workbench.startupEditor'),
				timeout(500).then(() => { timedOut.value = true; return undefined; })
			]);

			type StartupEditorExperimentClassification = {
				owner: 'osortega';
				comment: 'Tracks whether the startup editor experiment service call succeeded or timed out';
				timedOut: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the experiment service call timed out' };
				value: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment value returned, if any' };
			};
			type StartupEditorExperimentEvent = { timedOut: boolean; value: string | undefined };
			this.telemetryService.publicLog2<StartupEditorExperimentEvent, StartupEditorExperimentClassification>(
				'startupEditor.experimentServiceCall',
				{ timedOut: timedOut.value, value: experimentValue }
			);

			if (experimentValue) {
				return experimentValue;
			}
		} finally {
			this.startupEditorLoadingContextKey.set(false);
		}

		return startupEditorConfig.value;
	}

	private tryOpenWalkthroughForFolder(): boolean {
		const toRestore = this.storageService.get(restoreWalkthroughsConfigurationKey, StorageScope.PROFILE);
		if (!toRestore) {
			return false;
		}
		else {
			const restoreData: RestoreWalkthroughsConfigurationValue = JSON.parse(toRestore);
			const currentWorkspace = this.contextService.getWorkspace();
			if (restoreData.folder === UNKNOWN_EMPTY_WINDOW_WORKSPACE.id || restoreData.folder === currentWorkspace.folders[0].uri.toString()) {
				const options: GettingStartedEditorOptions = { selectedCategory: restoreData.category, selectedStep: restoreData.step, pinned: false, preserveFocus: this.shouldPreserveFocus() };
				this.editorService.openEditor({
					resource: GettingStartedInput.RESOURCE,
					options
				});
				this.storageService.remove(restoreWalkthroughsConfigurationKey, StorageScope.PROFILE);
				return true;
			}
		}
		return false;
	}

	private async openReadme() {
		const readmes = arrays.coalesce(
			await Promise.all(this.contextService.getWorkspace().folders.map(
				async folder => {
					const folderUri = folder.uri;
					const folderStat = await this.fileService.resolve(folderUri).catch(onUnexpectedError);
					const files = folderStat?.children ? folderStat.children.map(child => child.name).sort() : [];
					const file = files.find(file => file.toLowerCase() === 'readme.md') || files.find(file => file.toLowerCase().startsWith('readme'));
					if (file) { return joinPath(folderUri, file); }
					else { return undefined; }
				})));

		if (!this.editorService.activeEditor) {
			if (readmes.length) {
				const isMarkDown = (readme: URI) => readme.path.toLowerCase().endsWith('.md');
				await Promise.all([
					this.commandService.executeCommand('markdown.showPreview', null, readmes.filter(isMarkDown), { locked: true }).catch(error => {
						this.notificationService.error(localize('startupPage.markdownPreviewError', 'Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.', error.message));
					}),
					this.editorService.openEditors(readmes.filter(readme => !isMarkDown(readme)).map(readme => ({ resource: readme, options: { preserveFocus: this.shouldPreserveFocus() } }))),
				]);
			} else {
				// If no readme is found, default to showing the welcome page.
				await this.openGettingStarted();
			}
		}
	}

	private async openGettingStarted(showTelemetryNotice?: boolean) {
		const startupEditorTypeID = gettingStartedInputTypeId;
		const editor = this.editorService.activeEditor;

		// Ensure that the welcome editor won't get opened more than once
		if (editor?.typeId === startupEditorTypeID || this.editorService.editors.some(e => e.typeId === startupEditorTypeID)) {
			return;
		}

		if (startupEditorTypeID === gettingStartedInputTypeId) {
			this.editorService.openEditor({
				resource: GettingStartedInput.RESOURCE,
				options: {
					index: editor ? 0 : undefined,
					pinned: false,
					preserveFocus: this.shouldPreserveFocus(),
					...{ showTelemetryNotice }
				},
			});
		}
	}

	private async openAgentSessionsWelcome() {
		return this.commandService.executeCommand(AgentSessionsWelcomePage.COMMAND_ID);
	}

	private shouldPreserveFocus(): boolean {
		const activeElement = getActiveElement();
		if (!activeElement || activeElement === mainWindow.document.body || this.layoutService.hasFocus(Parts.EDITOR_PART)) {
			return false; // steal focus if nothing meaningful is focused or editor area has focus
		}

		return true; // do not steal focus
	}
}

function isStartupPageEnabled(startupEditorValue: string | undefined, contextService: IWorkspaceContextService, environmentService: IWorkbenchEnvironmentService) {
	if (environmentService.skipWelcome) {
		return false;
	}

	return startupEditorValue === 'welcomePage'
		|| startupEditorValue === 'readme'
		|| (contextService.getWorkbenchState() === WorkbenchState.EMPTY && startupEditorValue === 'welcomePageInEmptyWorkbench')
		|| startupEditorValue === 'terminal'
		|| startupEditorValue === 'agentSessionsWelcomePage';
}
