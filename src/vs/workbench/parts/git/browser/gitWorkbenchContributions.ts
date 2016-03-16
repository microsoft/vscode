/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/git.contribution';
import nls = require('vs/nls');
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import lifecycle = require('vs/base/common/lifecycle');
import winjs = require('vs/base/common/winjs.base');
import ext = require('vs/workbench/common/contributions');
import git = require('vs/workbench/parts/git/common/git');
import workbenchEvents = require('vs/workbench/common/events');
import common = require('vs/editor/common/editorCommon');
import widget = require('vs/editor/browser/widget/codeEditorWidget');
import viewlet = require('vs/workbench/browser/viewlet');
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import platform = require('vs/platform/platform');
import widgets = require('vs/workbench/parts/git/browser/gitWidgets');
import wbar = require('vs/workbench/common/actionRegistry');
import gitoutput = require('vs/workbench/parts/git/browser/gitOutput');
import output = require('vs/workbench/parts/output/common/output');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import confregistry = require('vs/platform/configuration/common/configurationRegistry');
import quickopen = require('vs/workbench/browser/quickopen');
import editorcontrib = require('vs/workbench/parts/git/browser/gitEditorContributions');
import {IActivityService, ProgressBadge, NumberBadge} from 'vs/workbench/services/activity/common/activityService';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {IModelService} from 'vs/editor/common/services/modelService';
import {RawText} from 'vs/editor/common/model/textModel';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import URI from 'vs/base/common/uri';

import IGitService = git.IGitService;

export class StatusUpdater implements ext.IWorkbenchContribution
{
	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.Workbench.StatusUpdater';

	private gitService: IGitService;
	private eventService: IEventService;
	private activityService:IActivityService;
	private messageService:IMessageService;
	private progressBadgeDelayer: async.Delayer<void>;
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IGitService gitService: IGitService,
		@IEventService eventService: IEventService,
		@IActivityService activityService: IActivityService,
		@IMessageService messageService: IMessageService
	) {
		this.gitService = gitService;
		this.eventService = eventService;
		this.activityService = activityService;
		this.messageService = messageService;

		this.progressBadgeDelayer = new async.Delayer<void>(200);

		this.toDispose = [];
		this.toDispose.push(this.gitService.addBulkListener2(e => this.onGitServiceChange()));
	}

	private onGitServiceChange(): void {
		if (this.gitService.getState() !== git.ServiceState.OK) {
			this.progressBadgeDelayer.cancel();
			this.activityService.showActivity('workbench.view.git', null, 'git-viewlet-label');
		} else if (this.gitService.isIdle()) {
			this.showChangesBadge();
		} else {
			this.progressBadgeDelayer.trigger(() => {
				this.activityService.showActivity('workbench.view.git', new ProgressBadge(() => nls.localize('gitProgressBadge', 'Running git status')), 'git-viewlet-label-progress');
			});
		}
	}

	private showChangesBadge(): void {
		var count = this.gitService.getModel().getStatus().getGroups().map((g1: git.IStatusGroup) => {
			return g1.all().length;
		}).reduce((a, b) => a + b, 0);

		var badge = new NumberBadge(count, (num)=>{ return nls.localize('gitPendingChangesBadge', '{0} pending changes', num); });

		this.progressBadgeDelayer.cancel();
		this.activityService.showActivity('workbench.view.git', badge, 'git-viewlet-label');
	}

	public getId(): string {
		return StatusUpdater.ID;
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}

class DirtyDiffModelDecorator {
	static GIT_ORIGINAL_SCHEME = 'git-index';

	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.Editor.DirtyDiffDecorator';
	static MODIFIED_DECORATION_OPTIONS: common.IModelDecorationOptions = {
		linesDecorationsClassName: 'git-dirty-modified-diff-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgba(0, 122, 204, 0.6)',
			darkColor: 'rgba(0, 122, 204, 0.6)',
			position: common.OverviewRulerLane.Left
		}
	};
	static ADDED_DECORATION_OPTIONS: common.IModelDecorationOptions = {
		linesDecorationsClassName: 'git-dirty-added-diff-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgba(0, 122, 204, 0.6)',
			darkColor: 'rgba(0, 122, 204, 0.6)',
			position: common.OverviewRulerLane.Left
		}
	};
	static DELETED_DECORATION_OPTIONS: common.IModelDecorationOptions = {
		linesDecorationsClassName: 'git-dirty-deleted-diff-glyph',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgba(0, 122, 204, 0.6)',
			darkColor: 'rgba(0, 122, 204, 0.6)',
			position: common.OverviewRulerLane.Left
		}
	};

	private modelService: IModelService;
	private editorWorkerService: IEditorWorkerService;
	private editorService: IWorkbenchEditorService;
	private contextService: IWorkspaceContextService;
	private gitService: IGitService;

	private model: common.IModel;
	private _originalContentsURI: URI;
	private path: string;
	private decorations: string[];

	private delayer: async.ThrottledDelayer<void>;
	private diffDelayer: async.ThrottledDelayer<void>;
	private toDispose: lifecycle.IDisposable[];

	constructor(model: common.IModel, path: string,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IGitService gitService: IGitService
	) {
		this.modelService = modelService;
		this.editorWorkerService = editorWorkerService;
		this.editorService = editorService;
		this.contextService = contextService;
		this.gitService = gitService;

		this.model = model;
		this._originalContentsURI = model.getAssociatedResource().withScheme(DirtyDiffModelDecorator.GIT_ORIGINAL_SCHEME);
		this.path = path;
		this.decorations = [];

		this.delayer = new async.ThrottledDelayer<void>(500);
		this.diffDelayer = new async.ThrottledDelayer<void>(200);

		this.toDispose = [];
		this.toDispose.push(model.addListener2(common.EventType.ModelContentChanged, () => this.triggerDiff()));
		this.toDispose.push(this.gitService.addListener2(git.ServiceEvents.STATE_CHANGED, () => this.onChanges()));
		this.toDispose.push(this.gitService.addListener2(git.ServiceEvents.OPERATION_END, e => {
			if (e.operation.id !== git.ServiceOperations.BACKGROUND_FETCH) {
				this.onChanges();
			}
		}));

		this.onChanges();
	}

	private onChanges(): void {
		if (!this.gitService) {
			return;
		}

		if (this.gitService.getState() !== git.ServiceState.OK) {
			return;
		}

		// go through all interesting models
		this.trigger();
	}

	private trigger(): void {
		this.delayer
			.trigger(() => this.diffOriginalContents())
			.done(null, errors.onUnexpectedError);
	}

	private diffOriginalContents(): winjs.TPromise<void> {
		return this.getOriginalContents()
			.then(contents => {
				if (!this.model || this.model.isDisposed()) {
					return; // disposed
				}

				if (!contents) {
					// untracked file
					this.modelService.destroyModel(this._originalContentsURI);
					return this.triggerDiff();
				}

				let originalModel = this.modelService.getModel(this._originalContentsURI);
				if (originalModel) {
					let contentsRawText = RawText.fromStringWithModelOptions(contents, originalModel);

					// return early if nothing has changed
					if (originalModel.equals(contentsRawText)) {
						return winjs.TPromise.as(null);
					}

					// we already have the original contents
					originalModel.setValueFromRawText(contentsRawText);
				} else {
					// this is the first time we load the original contents
					this.modelService.createModel(contents, null, this._originalContentsURI);
				}

				return this.triggerDiff();
			});
	}

	private getOriginalContents(): winjs.TPromise<string> {
		var gitModel = this.gitService.getModel();
		var treeish = gitModel.getStatus().find(this.path, git.StatusType.INDEX) ? '~' : 'HEAD';

		return this.gitService.buffer(this.path, treeish);
	}

	private triggerDiff(): winjs.Promise {
		if (!this.diffDelayer) {
			return winjs.TPromise.as(null);
		}

		return this.diffDelayer.trigger(() => {
			if (!this.model || this.model.isDisposed()) {
				return winjs.TPromise.as<any>([]); // disposed
			}

			return this.editorWorkerService.computeDirtyDiff(this._originalContentsURI, this.model.getAssociatedResource(), true);
		}).then((diff:common.IChange[]) => {
			if (!this.model || this.model.isDisposed()) {
				return; // disposed
			}

			return this.decorations = this.model.deltaDecorations(this.decorations, DirtyDiffModelDecorator.changesToDecorations(diff || []));
		});
	}

	private static changesToDecorations(diff:common.IChange[]): common.IModelDeltaDecoration[] {
		return diff.map((change) => {
			var startLineNumber = change.modifiedStartLineNumber;
			var endLineNumber = change.modifiedEndLineNumber || startLineNumber;

			// Added
			if (change.originalEndLineNumber === 0) {
				return {
					range: {
						startLineNumber: startLineNumber, startColumn: 1,
						endLineNumber: endLineNumber, endColumn: 1
					},
					options: DirtyDiffModelDecorator.ADDED_DECORATION_OPTIONS
				};
			}

			// Removed
			if (change.modifiedEndLineNumber === 0) {
				return {
					range: {
						startLineNumber: startLineNumber, startColumn: 1,
						endLineNumber: startLineNumber, endColumn: 1
					},
					options: DirtyDiffModelDecorator.DELETED_DECORATION_OPTIONS
				};
			}

			// Modified
			return {
				range: {
					startLineNumber: startLineNumber, startColumn: 1,
					endLineNumber: endLineNumber, endColumn: 1
				},
				options: DirtyDiffModelDecorator.MODIFIED_DECORATION_OPTIONS
			};
		});
	}

	public dispose(): void {
		this.modelService.destroyModel(this._originalContentsURI);
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		if (this.model && !this.model.isDisposed()) {
			this.model.deltaDecorations(this.decorations, []);
		}
		this.model = null;
		this.decorations = null;
		if (this.delayer) {
			this.delayer.cancel();
			this.delayer = null;
		}
		if (this.diffDelayer) {
			this.diffDelayer.cancel();
			this.diffDelayer = null;
		}
	}
}

export class DirtyDiffDecorator implements ext.IWorkbenchContribution {

	private gitService: IGitService;
	private messageService: IMessageService;
	private editorService: IWorkbenchEditorService;
	private eventService: IEventService;
	private contextService: IWorkspaceContextService;
	private instantiationService: IInstantiationService;
	private models: common.IModel[];
	private decorators: { [modelId:string]: DirtyDiffModelDecorator };
	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IGitService gitService: IGitService,
		@IMessageService messageService: IMessageService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEventService eventService: IEventService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.gitService = gitService;
		this.messageService = messageService;
		this.editorService = editorService;
		this.eventService = eventService;
		this.contextService = contextService;
		this.instantiationService = instantiationService;

		this.models = [];
		this.decorators = Object.create(null);
		this.toDispose = [];
		this.toDispose.push(eventService.addListener2(workbenchEvents.EventType.EDITOR_INPUT_CHANGED, () => this.onEditorInputChange()));
		this.toDispose.push(gitService.addListener2(git.ServiceEvents.DISPOSE, () => this.dispose()));
	}

	public getId(): string {
		return 'git.DirtyDiffModelDecorator';
	}

	private onEditorInputChange(): void {
		// HACK: This is the best current way of figuring out whether to draw these decorations
		// or not. Needs context from the editor, to know whether it is a diff editor, in place editor
		// etc.

		const repositoryRoot = this.gitService.getModel().getRepositoryRoot();

		// If there is no repository root, just wait until that changes
		if (typeof repositoryRoot !== 'string') {
			this.gitService.addOneTimeListener(git.ServiceEvents.STATE_CHANGED, () => this.onEditorInputChange());

			this.models.forEach(m => this.onModelInvisible(m));
			this.models = [];
			return;
		}

		const models = this.editorService.getVisibleEditors()

			// map to the editor controls
			.map(e => e.getControl())

			// only interested in code editor widgets
			.filter(c => c instanceof widget.CodeEditorWidget)

			// map to models
			.map(e => (<widget.CodeEditorWidget> e).getModel())

			// remove nulls and duplicates
			.filter((m, i, a) => !!m && a.indexOf(m, i + 1) === -1)

			// get the associated resource
			.map(m => ({ model: m, resource: m.getAssociatedResource() }))

			// remove nulls
			.filter(p => !!p.resource &&
				// and invalid resources
				(p.resource.scheme === 'file' && paths.isEqualOrParent(p.resource.fsPath, repositoryRoot))
			)

			// get paths
			.map(p => ({ model: p.model, path: paths.normalize(paths.relative(repositoryRoot, p.resource.fsPath)) }))

			// remove nulls and inside .git files
			.filter(p => !!p.path && p.path.indexOf('.git/') === -1);

		var newModels = models.filter(p => this.models.every(m => p.model !== m));
		var oldModels = this.models.filter(m => models.every(p => p.model !== m));

		newModels.forEach(p => this.onModelVisible(p.model, p.path));
		oldModels.forEach(m => this.onModelInvisible(m));

		this.models = models.map(p => p.model);
	}

	private onModelVisible(model: common.IModel, path: string): void {
		this.decorators[model.id] = this.instantiationService.createInstance(DirtyDiffModelDecorator, model, path);
	}

	private onModelInvisible(model: common.IModel): void {
		this.decorators[model.id].dispose();
		delete this.decorators[model.id];
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
		this.models.forEach(m => this.decorators[m.id].dispose());
		this.models = null;
		this.decorators = null;
	}
}

export var VIEWLET_ID = 'workbench.view.git';

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
	outputChannelRegistry.registerChannel('Git');

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
	(<wbar.IWorkbenchActionRegistry> platform.Registry.as(wbar.Extensions.WorkbenchActions)).registerWorkbenchAction(
		new SyncActionDescriptor(OpenGitViewletAction, OpenGitViewletAction.ID, OpenGitViewletAction.LABEL, {
			primary: null,
			win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
		}),
		nls.localize('view', "View")
	);

	// Register MergeDecorator
	EditorBrowserRegistry.registerEditorContribution(editorcontrib.MergeDecorator);

	// Register StatusUpdater
	(<ext.IWorkbenchContributionsRegistry>platform.Registry.as(ext.Extensions.Workbench)).registerWorkbenchContribution(
		StatusUpdater
	);

	// Register DirtyDiffDecorator
	(<ext.IWorkbenchContributionsRegistry>platform.Registry.as(ext.Extensions.Workbench)).registerWorkbenchContribution(
		DirtyDiffDecorator
	);

	// Register Quick Open for git
	(<quickopen.IQuickOpenRegistry>platform.Registry.as(quickopen.Extensions.Quickopen)).registerQuickOpenHandler(
		new quickopen.QuickOpenHandlerDescriptor(
			'vs/workbench/parts/git/browser/gitQuickOpen',
			'CommandQuickOpenHandler',
			'git ',
			nls.localize('gitCommands', "Git Commands")
		)
	);

	// Register configuration
	var configurationRegistry = <confregistry.IConfigurationRegistry>platform.Registry.as(confregistry.Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		id: 'git',
		order: 10,
		title: nls.localize('gitConfigurationTitle', "Git configuration"),
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
				default: null
			},
			'git.autofetch': {
				type: 'boolean',
				description: nls.localize('gitAutoFetch', "Whether auto fetching is enabled."),
				default: true
			}
		}
	});
}
