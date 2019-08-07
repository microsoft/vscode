/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDebugService, ILaunch } from 'vs/workbench/contrib/debug/common/debug';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StartAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup, IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { Mode, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { matchesFuzzy } from 'vs/base/common/filters';

class AddConfigEntry extends QuickOpenEntry {

	constructor(private label: string, private launch: ILaunch, private commandService: ICommandService, private contextService: IWorkspaceContextService, highlights: IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.label;
	}

	public getDescription(): string {
		return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.launch.name : '';
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, debug", this.getLabel());
	}

	public run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}
		this.commandService.executeCommand('debug.addConfiguration', this.launch.uri.toString());

		return true;
	}
}

class StartDebugEntry extends QuickOpenEntry {

	constructor(private debugService: IDebugService, private contextService: IWorkspaceContextService, private notificationService: INotificationService, private launch: ILaunch, private configurationName: string, highlights: IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.configurationName;
	}

	public getDescription(): string {
		return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.launch.name : '';
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, debug", this.getLabel());
	}

	public run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW || !StartAction.isEnabled(this.debugService)) {
			return false;
		}
		// Run selected debug configuration
		this.debugService.getConfigurationManager().selectConfiguration(this.launch, this.configurationName);
		this.debugService.startDebugging(this.launch).then(undefined, e => this.notificationService.error(e));

		return true;
	}
}

export class DebugQuickOpenHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.launch';

	private autoFocusIndex: number | undefined;

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}

	public getAriaLabel(): string {
		return nls.localize('debugAriaLabel', "Type a name of a launch configuration to run.");
	}

	public getResults(input: string, token: CancellationToken): Promise<QuickOpenModel> {
		const configurations: QuickOpenEntry[] = [];

		const configManager = this.debugService.getConfigurationManager();
		const launches = configManager.getLaunches();
		for (let launch of launches) {
			launch.getConfigurationNames().map(config => ({ config: config, highlights: matchesFuzzy(input, config, true) || undefined }))
				.filter(({ highlights }) => !!highlights)
				.forEach(({ config, highlights }) => {
					if (launch === configManager.selectedConfiguration.launch && config === configManager.selectedConfiguration.name) {
						this.autoFocusIndex = configurations.length;
					}
					configurations.push(new StartDebugEntry(this.debugService, this.contextService, this.notificationService, launch, config, highlights));
				});
		}
		launches.filter(l => !l.hidden).forEach((l, index) => {

			const label = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize('addConfiguration', "Add Configuration...");
			const entry = new AddConfigEntry(label, l, this.commandService, this.contextService, matchesFuzzy(input, label, true) || undefined);
			if (index === 0) {
				configurations.push(new QuickOpenEntryGroup(entry, undefined, true));
			} else {
				configurations.push(entry);
			}

		});

		return Promise.resolve(new QuickOpenModel(configurations));
	}

	public getAutoFocus(input: string): IAutoFocus {
		return {
			autoFocusFirstEntry: !!input,
			autoFocusIndex: this.autoFocusIndex
		};
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noConfigurationsMatching', "No debug configurations matching");
		}

		return nls.localize('noConfigurationsFound', "No debug configurations found. Please create a 'launch.json' file.");
	}
}
