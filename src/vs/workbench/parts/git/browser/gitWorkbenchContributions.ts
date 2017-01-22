/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/git.contribution';
import nls = require('vs/nls');
import async = require('vs/base/common/async');
import lifecycle = require('vs/base/common/lifecycle');
import ext = require('vs/workbench/common/contributions');
import git = require('vs/workbench/parts/git/common/git');
import viewlet = require('vs/workbench/browser/viewlet');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import platform = require('vs/platform/platform');
import widgets = require('vs/workbench/parts/git/browser/gitWidgets');
import wbar = require('vs/workbench/common/actionRegistry');
import gitoutput = require('vs/workbench/parts/git/browser/gitOutput');
import output = require('vs/workbench/parts/output/common/output');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import confregistry = require('vs/platform/configuration/common/configurationRegistry');
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import quickopen = require('vs/workbench/browser/quickopen');
import 'vs/workbench/parts/git/browser/gitEditorContributions';
import { IActivityBarService, ProgressBadge, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IMessageService } from 'vs/platform/message/common/message';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { GitSCMProvider } from './gitScm';

import IGitService = git.IGitService;

export class StatusUpdater implements ext.IWorkbenchContribution {
	static ID = 'vs.git.statusUpdater';

	private gitService: IGitService;
	private activityBarService: IActivityBarService;
	private messageService: IMessageService;
	private configurationService: IConfigurationService;
	private progressBadgeDelayer: async.Delayer<void>;
	private badgeHandle: lifecycle.IDisposable;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IGitService gitService: IGitService,
		@IActivityBarService activityBarService: IActivityBarService,
		@IMessageService messageService: IMessageService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		this.gitService = gitService;
		this.activityBarService = activityBarService;
		this.messageService = messageService;
		this.configurationService = configurationService;

		this.progressBadgeDelayer = new async.Delayer<void>(200);

		this.toDispose = [];
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onGitServiceChange()));
		this.toDispose.push(this.gitService.addBulkListener2(e => this.onGitServiceChange()));
	}

	private onGitServiceChange(): void {

		lifecycle.dispose(this.badgeHandle);

		if (this.gitService.getState() !== git.ServiceState.OK) {
			this.progressBadgeDelayer.cancel();

		} else if (this.gitService.isIdle()) {
			this.showChangesBadge();
		} else {
			this.progressBadgeDelayer.trigger(() => {
				this.badgeHandle = this.activityBarService.showActivity('workbench.view.git', new ProgressBadge(() => nls.localize('gitProgressBadge', 'Running git status')), 'git-viewlet-label-progress');
			});
		}
	}

	private showChangesBadge(): void {
		this.progressBadgeDelayer.cancel();

		const { countBadge } = this.configurationService.getConfiguration<git.IGitConfiguration>('git');

		if (countBadge === 'off') {
			return;
		}

		const filter = countBadge === 'tracked'
			? s => s.getStatus() !== git.Status.UNTRACKED
			: () => true;

		const statuses = this.gitService.getModel().getStatus().getGroups()
			.map(g => g.all())
			.reduce((r, g) => r.concat(g), [])
			.filter(filter);

		const badge = new NumberBadge(statuses.length, num => nls.localize('gitPendingChangesBadge', '{0} pending changes', num));
		this.badgeHandle = this.activityBarService.showActivity('workbench.view.git', badge, 'git-viewlet-label');
	}

	public getId(): string {
		return StatusUpdater.ID;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		lifecycle.dispose(this.badgeHandle);
	}
}

export const VIEWLET_ID = 'workbench.view.git';

class OpenGitViewletAction extends viewlet.ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = nls.localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

export function registerContributions(): void {

	// Register Statusbar item
	(<statusbar.IStatusbarRegistry>platform.Registry.as(statusbar.Extensions.Statusbar)).registerStatusbarItem(new statusbar.StatusbarItemDescriptor(
		widgets.GitStatusbarItem,
		statusbar.StatusbarAlignment.LEFT,
		100 /* High Priority */
	));

	// Register Output Channel
	var outputChannelRegistry = <output.IOutputChannelRegistry>platform.Registry.as(output.Extensions.OutputChannels);
	outputChannelRegistry.registerChannel('Git', nls.localize('git', "Git"));

	// Register Git Output
	(<ext.IWorkbenchContributionsRegistry>platform.Registry.as(ext.Extensions.Workbench)).registerWorkbenchContribution(
		gitoutput.GitOutput
	);

	// Register Viewlet
	(<viewlet.ViewletRegistry>platform.Registry.as(viewlet.Extensions.Viewlets)).registerViewlet(new viewlet.ViewletDescriptor(
		'vs/workbench/parts/git/browser/gitViewlet',
		'GitViewlet',
		VIEWLET_ID,
		nls.localize('git', "Git"),
		'git',
		35
	));

	// Register Action to Open Viewlet
	(<wbar.IWorkbenchActionRegistry>platform.Registry.as(wbar.Extensions.WorkbenchActions)).registerWorkbenchAction(
		new SyncActionDescriptor(OpenGitViewletAction, OpenGitViewletAction.ID, OpenGitViewletAction.LABEL, {
			primary: null,
			win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
		}),
		'View: Show Git',
		nls.localize('view', "View")
	);

	// Register StatusUpdater
	(<ext.IWorkbenchContributionsRegistry>platform.Registry.as(ext.Extensions.Workbench)).registerWorkbenchContribution(
		StatusUpdater
	);

	// Register GitSCMProvider
	(<ext.IWorkbenchContributionsRegistry>platform.Registry.as(ext.Extensions.Workbench)).registerWorkbenchContribution(
		GitSCMProvider
	);

	// Register Quick Open for git
	(<quickopen.IQuickOpenRegistry>platform.Registry.as(quickopen.Extensions.Quickopen)).registerQuickOpenHandler(
		new quickopen.QuickOpenHandlerDescriptor(
			'vs/workbench/parts/git/browser/gitQuickOpen',
			'GitCommandQuickOpenHandler',
			'git ',
			nls.localize('gitCommands', "Git Commands")
		)
	);

	// Register configuration
	var configurationRegistry = <confregistry.IConfigurationRegistry>platform.Registry.as(confregistry.Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'git',
		order: 15,
		title: nls.localize('gitConfigurationTitle', "Git"),
		type: 'object',
		properties: {
			'git.enabled': {
				type: 'boolean',
				description: nls.localize('gitEnabled', "Is git enabled"),
				default: true
			},
			'git.path': {
				type: ['string', 'null'],
				description: nls.localize('gitPath', "Path to the git executable"),
				default: null,
				isExecutable: true
			},
			'git.autorefresh': {
				type: 'boolean',
				description: nls.localize('gitAutoRefresh', "Whether auto refreshing is enabled"),
				default: true
			},
			'git.autofetch': {
				type: 'boolean',
				description: nls.localize('gitAutoFetch', "Whether auto fetching is enabled."),
				default: true
			},
			'git.enableLongCommitWarning': {
				type: 'boolean',
				description: nls.localize('gitLongCommit', "Whether long commit messages should be warned about."),
				default: true
			},
			'git.allowLargeRepositories': {
				type: 'boolean',
				description: nls.localize('gitLargeRepos', "Always allow large repositories to be managed by Code."),
				default: false
			},
			'git.confirmSync': {
				type: 'boolean',
				description: nls.localize('confirmSync', "Confirm before synchronizing git repositories."),
				default: true
			},
			'git.countBadge': {
				type: 'string',
				enum: ['all', 'tracked', 'off'],
				default: 'all',
				description: nls.localize('countBadge', "Controls the git badge counter."),
			},
			'git.checkoutType': {
				type: 'string',
				enum: ['all', 'local', 'tags', 'remote'],
				default: 'all',
				description: nls.localize('checkoutType', "Controls what type of branches are listed."),
			}
		}
	});
}
