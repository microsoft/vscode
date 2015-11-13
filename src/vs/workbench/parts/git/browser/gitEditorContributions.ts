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

import IGitService = git.IGitService;

export class MergeDecorator implements common.IEditorContribution {

	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.Editor.MergeDecorator';
	static DECORATION_OPTIONS:common.IModelDecorationOptions = {
		className: 'git-merge-control-decoration',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgb(197, 118, 0)',
			darkColor: 'rgb(197, 118, 0)',
			position: common.OverviewRulerLane.Left
		}
	};

	private editor: editorbrowser.ICodeEditor;
	private gitService: git.IGitService;
	private contextService: IWorkspaceContextService;
	private toUnbind: ee.ListenerUnbind[];

	private decorations: string[];
	private model: common.IModel;
	private unbindModelListener: ()=>void;

	constructor(editor: editorbrowser.ICodeEditor, @IGitService gitService: IGitService, @IWorkspaceContextService contextService : IWorkspaceContextService) {
		this.gitService = gitService;
		this.contextService = contextService;
		this.editor = editor;
		this.toUnbind = [ this.editor.addListener(common.EventType.ModelChanged, this.onModelChanged.bind(this)) ];
		this.decorations = [];
		this.model = null;
		this.unbindModelListener = null;
	}

	public getId(): string {
		return MergeDecorator.ID;
	}

	private onModelChanged(): void {
		if (this.model) {
			this.decorations = this.model.deltaDecorations(this.decorations, []);
			this.unbindModelListener();
			this.unbindModelListener = null;
			this.model = null;
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

		var gitModel = this.gitService.getModel();
		var mergeStatus = gitModel.getStatus().find(path, git.StatusType.MERGE);
		if (!mergeStatus) {
			return;
		}

		this.model = model;
		this.redecorate();
		this.unbindModelListener = this.model.addListener(common.EventType.ModelContentChanged, this.redecorate.bind(this));
	}

	private redecorate(): void {
		var decorations: common.IModelDeltaDecoration[] = [];
		var lineCount = this.model.getLineCount();

		for (var i = 1; i <= lineCount; i++) {
			var start = this.model.getLineContent(i).substr(0, 7);

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

		this.decorations = this.model.deltaDecorations(this.decorations, decorations);
	}

	public dispose(): void {
		while(this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}
}
