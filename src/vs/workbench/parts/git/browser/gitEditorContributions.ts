/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import ee = require('vs/base/common/eventEmitter');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import common = require('vs/editor/common/editorCommon');
import git = require('vs/workbench/parts/git/common/git');
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {Disposable} from 'vs/base/common/lifecycle';
import {RunOnceScheduler} from 'vs/base/common/async';

import IGitService = git.IGitService;

class MergeDecoratorBoundToModel extends Disposable {

	private _editor: editorbrowser.ICodeEditor;
	private _model: common.IModel;
	private _gitService: git.IGitService;
	private _filePath:string;
	private _redecorateSoon: RunOnceScheduler;
	private _decorations: string[];

	constructor(editor: editorbrowser.ICodeEditor, model:common.IModel, filePath:string, gitService: git.IGitService) {
		super();
		this._editor = editor;
		this._model = model;
		this._gitService = gitService;
		this._filePath = filePath;
		this._decorations = [];
		this._redecorateSoon = this._register(new RunOnceScheduler(() => this.redecorate(), 300));
		this._register(this._model.addListener2(common.EventType.ModelContentChanged, () => this._redecorateSoon.schedule()));
		this._register(this._gitService.addListener2(git.ServiceEvents.STATE_CHANGED, () => this._redecorateSoon.schedule()));
		this._redecorateSoon.schedule();
	}

	public dispose(): void {
		this._setDecorations([]);
		super.dispose();
	}

	private _setDecorations(newDecorations: common.IModelDeltaDecoration[]): void {
		this._decorations = this._editor.deltaDecorations(this._decorations, newDecorations);
	}

	private redecorate(): void {
		var gitModel = this._gitService.getModel();
		var mergeStatus = gitModel.getStatus().find(this._filePath, git.StatusType.MERGE);
		if (!mergeStatus) {
			return;
		}

		let decorations: common.IModelDeltaDecoration[] = [];
		let lineCount = this._model.getLineCount();

		for (let i = 1; i <= lineCount; i++) {
			let start = this._model.getLineContent(i).substr(0, 7);

			switch (start) {
				case '<<<<<<<':
				case '=======':
				case '>>>>>>>':
					decorations.push({
						range: { startLineNumber: i, startColumn: 1, endLineNumber: i, endColumn: 1 },
						options: MergeDecorator.DECORATION_OPTIONS
					});
					break;
			}
		}

		this._setDecorations(decorations);
	}
}

export class MergeDecorator implements common.IEditorContribution {

	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.Editor.MergeDecorator';
	static DECORATION_OPTIONS:common.IModelDecorationOptions = {
		className: 'git-merge-control-decoration',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgb(197, 118, 0)',
			darkColor: 'rgb(197, 118, 0)',
			position: common.OverviewRulerLane.Left
		},
		stickiness: common.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private editor: editorbrowser.ICodeEditor;
	private gitService: git.IGitService;
	private contextService: IWorkspaceContextService;
	private toUnbind: ee.ListenerUnbind[];

	private mergeDecorator: MergeDecoratorBoundToModel;

	constructor(editor: editorbrowser.ICodeEditor, @IGitService gitService: IGitService, @IWorkspaceContextService contextService : IWorkspaceContextService) {
		this.gitService = gitService;
		this.contextService = contextService;
		this.editor = editor;
		this.toUnbind = [ this.editor.addListener(common.EventType.ModelChanged, this.onModelChanged.bind(this)) ];
		this.mergeDecorator = null;
	}

	public getId(): string {
		return MergeDecorator.ID;
	}

	private onModelChanged(): void {
		if (this.mergeDecorator) {
			this.mergeDecorator.dispose();
			this.mergeDecorator = null;
		}

		if (!this.contextService || !this.gitService) {
			return;
		}

		var model = this.editor.getModel();
		if (!model) {
			return;
		}

		var resource = model.getAssociatedResource();
		if (!resource) {
			return;
		}

		var path = this.contextService.toWorkspaceRelativePath(resource);
		if (!path) {
			return;
		}

		this.mergeDecorator = new MergeDecoratorBoundToModel(this.editor, model, path, this.gitService);
	}

	public dispose(): void {
		if (this.mergeDecorator) {
			this.mergeDecorator.dispose();
			this.mergeDecorator = null;
		}
		while(this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}
