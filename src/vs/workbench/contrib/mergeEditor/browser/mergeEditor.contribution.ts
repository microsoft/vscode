/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditor';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { MergeEditorSerializer } from './mergeEditorSerializer';


//#region Editor Descriptior

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

registerAction2(class Foo extends Action2 {

	constructor() {
		super({
			id: 'testMergeEditor',
			title: '3wm',
			f1: true
		});
	}
	run(accessor: ServicesAccessor, ...args: any[]): void {
		const validatedArgs = ITestMergeEditorArgs.validate(args[0]);

		function normalize(uri: URI | string): URI {
			if (typeof uri === 'string') {
				return URI.parse(uri);
			} else {
				return uri;
			}
		}

		const instaService = accessor.get(IInstantiationService);
		const input = instaService.createInstance(
			MergeEditorInput,
			normalize(validatedArgs.ancestor),
			normalize(validatedArgs.input1),
			normalize(validatedArgs.input2),
			normalize(validatedArgs.output),
		);
		accessor.get(IEditorService).openEditor(input);
	}

});

namespace ITestMergeEditorArgs {
	export function validate(args: any): ITestMergeEditorArgs {
		return args as ITestMergeEditorArgs;
	}
}

interface ITestMergeEditorArgs {
	ancestor: URI | string;
	input1: URI | string;
	input2: URI | string;
	output: URI | string;
}
