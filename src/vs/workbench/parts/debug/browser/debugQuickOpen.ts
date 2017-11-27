/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import Filters = require('vs/base/common/filters');
import { TPromise } from 'vs/base/common/winjs.base';
import Quickopen = require('vs/workbench/browser/quickopen');
import QuickOpen = require('vs/base/parts/quickopen/common/quickOpen');
import Model = require('vs/base/parts/quickopen/browser/quickOpenModel');
import { IDebugService, ILaunch } from 'vs/workbench/parts/debug/common/debug';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import * as errors from 'vs/base/common/errors';
import { QuickOpenEntry, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { StartAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IMessageService } from 'vs/platform/message/common/message';
import { Severity } from 'vs/workbench/services/message/browser/messageList';

class AddConfigEntry extends Model.QuickOpenEntry {

	constructor(private label: string, private launch: ILaunch, private commandService: ICommandService, private contextService: IWorkspaceContextService, highlights: Model.IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.label;
	}

	public getDescription(): string {
		return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.launch.workspace.name : '';
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, debug", this.getLabel());
	}

	public run(mode: QuickOpen.Mode, context: Model.IContext): boolean {
		if (mode === QuickOpen.Mode.PREVIEW) {
			return false;
		}
		this.commandService.executeCommand('debug.addConfiguration', this.launch.workspace.uri.toString()).done(undefined, errors.onUnexpectedError);

		return true;
	}
}

class StartDebugEntry extends Model.QuickOpenEntry {

	constructor(private debugService: IDebugService, private contextService: IWorkspaceContextService, private messageService: IMessageService, private launch: ILaunch, private configurationName: string, highlights: Model.IHighlight[] = []) {
		super(highlights);
	}

	public getLabel(): string {
		return this.configurationName;
	}

	public getDescription(): string {
		return this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.launch.workspace.name : '';
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, debug", this.getLabel());
	}

	public run(mode: QuickOpen.Mode, context: Model.IContext): boolean {
		if (mode === QuickOpen.Mode.PREVIEW || !StartAction.isEnabled(this.debugService, this.contextService, this.configurationName)) {
			return false;
		}
		// Run selected debug configuration
		this.debugService.getConfigurationManager().selectConfiguration(this.launch, this.configurationName);
		this.debugService.startDebugging(this.launch.workspace).done(undefined, e => this.messageService.show(Severity.Error, e));

		return true;
	}
}

export class DebugQuickOpenHandler extends Quickopen.QuickOpenHandler {

	public static readonly ID = 'workbench.picker.launch';
	private autoFocusIndex: number;

	constructor(
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ICommandService private commandService: ICommandService,
		@IMessageService private messageService: IMessageService
	) {
		super();
	}

	public getAriaLabel(): string {
		return nls.localize('debugAriaLabel', "Type a name of a launch configuration to run.");
	}

	public getResults(input: string): TPromise<Model.QuickOpenModel> {
		const configurations: QuickOpenEntry[] = [];

		const configManager = this.debugService.getConfigurationManager();
		const launches = configManager.getLaunches();
		for (let launch of launches) {
			launch.getConfigurationNames().map(config => ({ config: config, highlights: Filters.matchesContiguousSubString(input, config) }))
				.filter(({ highlights }) => !!highlights)
				.forEach(({ config, highlights }) => {
					if (launch === configManager.selectedLaunch && config === configManager.selectedName) {
						this.autoFocusIndex = configurations.length;
					}
					configurations.push(new StartDebugEntry(this.debugService, this.contextService, this.messageService, launch, config, highlights));
				});
		}
		launches.forEach((l, index) => {
			const label = launches.length > 1 ? nls.localize("addConfigTo", "Add Config ({0})...", l.workspace.name) : nls.localize('addConfiguration', "Add Configuration...");
			const entry = new AddConfigEntry(label, l, this.commandService, this.contextService, Filters.matchesContiguousSubString(input, label));
			if (index === 0) {
				configurations.push(new QuickOpenEntryGroup(entry, undefined, true));
			} else {
				configurations.push(entry);
			}

		});

		return TPromise.as(new Model.QuickOpenModel(configurations));
	}

	public getAutoFocus(input: string): QuickOpen.IAutoFocus {
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
