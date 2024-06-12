/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IFlowGraph } from 'vs/workbench/contrib/flowEditor/common/flowGraphService';

export class FlowEditorInput extends EditorInput {
	public static readonly ID: string = 'workbench.editorinputs.flow';
	public static readonly EXT: string = '.vsflow';

	override get typeId(): string {
		return FlowEditorInput.ID;
	}

	public get resource() {
		return this.flowGraph.uri;
	}

	public override get editorId(): string {
		return 'flowEditor';
	}

	constructor(public readonly flowGraph: IFlowGraph) {
		super();
	}
}
