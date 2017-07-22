/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { Action } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { Schemas } from 'vs/base/common/network';

export class EditorWalkThroughAction extends Action {

	public static ID = 'workbench.action.showInteractivePlayground';
	public static LABEL = localize('editorWalkThrough', "Interactive Playground");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const uri = URI.parse(require.toUrl('./vs_code_editor_walkthrough.md'))
			.with({ scheme: Schemas.walkThrough });
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('editorWalkThrough.title', "Interactive Playground"), '', uri, /* telemetryFrom */ null, /* onReady */ null);
		return this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(() => void (0));
	}
}