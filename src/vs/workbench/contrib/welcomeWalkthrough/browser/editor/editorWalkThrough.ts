/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import content from 'vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough';
import { localize, localize2 } from 'vs/nls';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { WalkThroughInput, WalkThroughInputOptions } from 'vs/workbench/contrib/welcomeWalkthrough/browser/walkThroughInput';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IEditorSerializer } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Action2 } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { walkThroughContentRegistry } from 'vs/workbench/contrib/welcomeWalkthrough/common/walkThroughContentProvider';

walkThroughContentRegistry.registerProvider('vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough', content);

const typeId = 'workbench.editors.walkThroughInput';
const inputOptions: WalkThroughInputOptions = {
	typeId,
	name: localize('editorWalkThrough.title', "Editor Playground"),
	resource: FileAccess.asBrowserUri('vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough.md')
		.with({
			scheme: Schemas.walkThrough,
			query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeWalkthrough/browser/editor/vs_code_editor_walkthrough' })
		}),
	telemetryFrom: 'walkThrough'
};

export class EditorWalkThroughAction extends Action2 {

	public static readonly ID = 'workbench.action.showInteractivePlayground';
	public static readonly LABEL = localize2('editorWalkThrough', 'Interactive Editor Playground');

	constructor() {
		super({
			id: EditorWalkThroughAction.ID,
			title: EditorWalkThroughAction.LABEL,
			category: Categories.Help,
			f1: true,
			metadata: {
				description: localize2('editorWalkThroughMetadata', "Opens an interactive playground for learning about the editor.")
			}
		});
	}

	public override run(serviceAccessor: ServicesAccessor): Promise<void> {
		const editorService = serviceAccessor.get(IEditorService);
		const instantiationService = serviceAccessor.get(IInstantiationService);
		const input = instantiationService.createInstance(WalkThroughInput, inputOptions);
		// TODO @lramos15 adopt the resolver here
		return editorService.openEditor(input, { pinned: true })
			.then(() => void (0));
	}
}

export class EditorWalkThroughInputSerializer implements IEditorSerializer {

	static readonly ID = typeId;

	public canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	public serialize(editorInput: EditorInput): string {
		return '';
	}

	public deserialize(instantiationService: IInstantiationService): WalkThroughInput {
		return instantiationService.createInstance(WalkThroughInput, inputOptions);
	}
}
