/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { MergeEditorInput, MergeEditorInputData } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { ctxIsMergeEditor, ctxUsesColumnLayout, MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class OpenMergeEditor extends Action2 {

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
}

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

		const uri = toUri((<IRelaxedInputData>obj).uri);
		const detail = (<IRelaxedInputData>obj).detail;
		const description = (<IRelaxedInputData>obj).description;
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

export class ToggleLayout extends Action2 {
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
}
