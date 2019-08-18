/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase, ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { language } from 'vs/base/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { configurationTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export class TelemetryContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IActivityBarService activityBarService: IActivityBarService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IEditorService editorService: IEditorService,
		@IKeybindingService keybindingsService: IKeybindingService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@IViewletService viewletService: IViewletService
	) {
		super();

		const { filesToOpenOrCreate, filesToDiff } = environmentService.configuration;
		const activeViewlet = viewletService.getActiveViewlet();

		type WindowSizeFragment = {
			innerHeight: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			innerWidth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			outerHeight: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			outerWidth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};
		type WorkspaceLoadClassification = {
			userAgent: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			emptyWorkbench: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			windowSize: WindowSizeFragment;
			'workbench.filesToOpenOrCreate': { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			'workbench.filesToDiff': { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			customKeybindingsCount: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			theme: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			language: { classification: 'SystemMetaData', purpose: 'BusinessInsight' };
			pinnedViewlets: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			restoredViewlet?: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			restoredEditors: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			startupKind: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};
		type WorkspaceLoadEvent = {
			userAgent: string;
			windowSize: { innerHeight: number, innerWidth: number, outerHeight: number, outerWidth: number };
			emptyWorkbench: boolean;
			'workbench.filesToOpenOrCreate': number;
			'workbench.filesToDiff': number;
			customKeybindingsCount: number;
			theme: string;
			language: string;
			pinnedViewlets: string[];
			restoredViewlet?: string;
			restoredEditors: number;
			startupKind: StartupKind;
		};
		telemetryService.publicLog2<WorkspaceLoadEvent, WorkspaceLoadClassification>('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: contextService.getWorkbenchState() === WorkbenchState.EMPTY,
			'workbench.filesToOpenOrCreate': filesToOpenOrCreate && filesToOpenOrCreate.length || 0,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || 0,
			customKeybindingsCount: keybindingsService.customKeybindingsCount(),
			theme: themeService.getColorTheme().id,
			language,
			pinnedViewlets: activityBarService.getPinnedViewletIds(),
			restoredViewlet: activeViewlet ? activeViewlet.getId() : undefined,
			restoredEditors: editorService.visibleEditors.length,
			startupKind: lifecycleService.startupKind
		});

		// Error Telemetry
		this._register(new ErrorTelemetry(telemetryService));

		// Configuration Telemetry
		this._register(configurationTelemetry(telemetryService, configurationService));

		// Lifecycle
		this._register(lifecycleService.onShutdown(() => this.dispose()));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TelemetryContribution, LifecyclePhase.Restored);