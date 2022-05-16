/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { localize } from 'vs/nls';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { ctxIsMergeEditor, ctxUsesColumnLayout, MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditor';
import { MergeEditorInput, MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { MergeEditorSerializer } from './mergeEditorSerializer';
import { Codicon } from 'vs/base/common/codicons';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MergeEditor,
		MergeEditor.ID,
		localize('name', "Merge Editor")
	),
	[
		new SyncDescriptor(MergeEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	MergeEditorInput.ID,
	MergeEditorSerializer
);

registerAction2(class ToggleLayout extends Action2 {

	constructor() {
		super({
			id: 'merge.toggleLayout',
			title: localize('toggle.title', "Switch to column view"),
			icon: Codicon.layoutCentered,
			toggled: {
				condition: ctxUsesColumnLayout,
				icon: Codicon.layoutPanel,
				title: localize('toggle.title2', "Switch to 2 by 1 view"),
			},
			menu: [{
				id: MenuId.EditorTitle,
				when: ctxIsMergeEditor,
				group: 'navigation'
			}]
		});
	}

	run(accessor: ServicesAccessor): void {
		const { activeEditorPane } = accessor.get(IEditorService);
		if (activeEditorPane instanceof MergeEditor) {
			activeEditorPane.toggleLayout();
		}
	}
});

registerAction2(class Open extends Action2 {

	constructor() {
		super({
			id: '_open.mergeEditor',
			title: localize('title', "Open Merge Editor"),
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]): void {
		const validatedArgs = IRelaxedOpenArgs.validate(args[0]);

		const instaService = accessor.get(IInstantiationService);
		const input = instaService.createInstance(
			MergeEditorInput,
			validatedArgs.ancestor,
			validatedArgs.input1,
			validatedArgs.input2,
			validatedArgs.output,
		);
		accessor.get(IEditorService).openEditor(input);
	}

});

namespace IRelaxedOpenArgs {
	function toUri(obj: unknown): URI {
		if (typeof obj === 'string') {
			return URI.parse(obj, true);
		} else if (obj && typeof obj === 'object') {
			return URI.revive(<UriComponents>obj);
		}
		throw new TypeError('invalid argument');
	}

	function isUriComponents(obj: unknown): obj is UriComponents {
		if (!obj || typeof obj !== 'object') {
			return false;
		}
		return typeof (<UriComponents>obj).scheme === 'string'
			&& typeof (<UriComponents>obj).authority === 'string'
			&& typeof (<UriComponents>obj).path === 'string'
			&& typeof (<UriComponents>obj).query === 'string'
			&& typeof (<UriComponents>obj).fragment === 'string';
	}

	function toInputResource(obj: unknown): MergeEditorInputData {
		if (typeof obj === 'string') {
			return new MergeEditorInputData(URI.parse(obj, true), undefined, undefined);
		}
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}

		if (isUriComponents(obj)) {
			return new MergeEditorInputData(URI.revive(obj), undefined, undefined);
		}

		let uri = toUri((<IRelaxedInputData>obj).uri);
		let detail = (<IRelaxedInputData>obj).detail;
		let description = (<IRelaxedInputData>obj).description;
		return new MergeEditorInputData(uri, detail, description);
	}

	export function validate(obj: unknown): IOpenEditorArgs {
		if (!obj || typeof obj !== 'object') {
			throw new TypeError('invalid argument');
		}
		const ancestor = toUri((<IRelaxedOpenArgs>obj).ancestor);
		const output = toUri((<IRelaxedOpenArgs>obj).output);
		const input1 = toInputResource((<IRelaxedOpenArgs>obj).input1);
		const input2 = toInputResource((<IRelaxedOpenArgs>obj).input2);
		return { ancestor, input1, input2, output };
	}
}

type IRelaxedInputData = { uri: UriComponents; detail?: string; description?: string };

type IRelaxedOpenArgs = {
	ancestor: UriComponents | string;
	input1: IRelaxedInputData | string;
	input2: IRelaxedInputData | string;
	output: UriComponents | string;
};

interface IOpenEditorArgs {
	ancestor: URI;
	input1: MergeEditorInputData;
	input2: MergeEditorInputData;
	output: URI;
}
