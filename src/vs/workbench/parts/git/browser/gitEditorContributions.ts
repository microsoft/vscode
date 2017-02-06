/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IModel, IModelDeltaDecoration, IModelDecorationOptions, OverviewRulerLane, IEditorContribution, TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { IGitService, ModelEvents, StatusType } from 'vs/workbench/parts/git/common/git';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Disposable } from 'vs/base/common/lifecycle';
import { Delayer } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';

const pattern = /^<<<<<<<|^=======|^>>>>>>>/;

function decorate(model: IModel): IModelDeltaDecoration[] {
	const options = MergeDecorator.DECORATION_OPTIONS;

	return model.getLinesContent()
		.map((line, i) => pattern.test(line) ? i : null)
		.filter(i => i !== null)
		.map(i => ({ startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: 1 }))
		.map(range => ({ range, options }));
}

class MergeDecoratorBoundToModel extends Disposable {

	private decorations: string[];

	constructor(
		private editor: ICodeEditor,
		private model: IModel,
		private filePath: string,
		private gitService: IGitService
	) {
		super();

		this.decorations = [];

		const delayer = new Delayer<void>(300);
		delayer.trigger(() => this.redecorate());

		const gitModel = gitService.getModel();
		this._register(model.onDidChangeContent(() => delayer.trigger(() => this.redecorate())));
		this._register(gitModel.addListener2(ModelEvents.STATUS_MODEL_UPDATED, () => delayer.trigger(() => this.redecorate())));
	}

	private _setDecorations(newDecorations: IModelDeltaDecoration[]): void {
		this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations);
	}

	private redecorate(): void {
		if (this.model.isDisposed()) {
			return;
		}

		const gitModel = this.gitService.getModel();

		if (!gitModel) {
			return;
		}

		const mergeStatus = gitModel.getStatus().find(this.filePath, StatusType.MERGE);

		if (!mergeStatus) {
			return;
		}

		this._setDecorations(decorate(this.model));
	}

	dispose(): void {
		this._setDecorations([]);
		super.dispose();
	}
}

export class MergeDecorator extends Disposable implements IEditorContribution {

	static ID = 'vs.git.editor.merge.decorator';

	static DECORATION_OPTIONS: IModelDecorationOptions = {
		className: 'git-merge-control-decoration',
		isWholeLine: true,
		overviewRuler: {
			color: 'rgb(197, 118, 0)',
			darkColor: 'rgb(197, 118, 0)',
			position: OverviewRulerLane.Left
		},
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	private mergeDecorator: MergeDecoratorBoundToModel;

	constructor(
		private editor: ICodeEditor,
		@IGitService private gitService: IGitService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));
		this.mergeDecorator = null;
	}

	getId(): string {
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

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		const resource = model.uri;
		if (!resource) {
			return;
		}

		const path = this.contextService.toWorkspaceRelativePath(resource);
		if (!path) {
			return;
		}

		this.mergeDecorator = new MergeDecoratorBoundToModel(this.editor, model, path, this.gitService);
	}

	dispose(): void {
		if (this.mergeDecorator) {
			this.mergeDecorator.dispose();
			this.mergeDecorator = null;
		}

		super.dispose();
	}
}

// TODO@Joao: remove
@editorContribution
export class MergeDecoratorWrapper extends Disposable implements IEditorContribution {

	static ID = 'vs.git.editor.merge.decoratorwrapper';
	private decorator: MergeDecorator;

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		if (SCMPreview.enabled) {
			return;
		}

		this.decorator = instantiationService.createInstance(MergeDecorator, editor);
	}

	getId(): string {
		return MergeDecoratorWrapper.ID;
	}

	dispose(): void {
		if (this.decorator) {
			this.decorator.dispose();
			this.decorator = null;
		}
	}
}