/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IInstantiationService, IConstructorSignature1} from 'vs/platform/instantiation/common/instantiation';
import {Registry} from 'vs/platform/platform';
import {IEditorContribution} from 'vs/editor/common/editorCommon';
import {ICodeEditor, IEditorContributionDescriptor, ISimpleEditorContributionCtor} from 'vs/editor/browser/editorBrowser';

export namespace EditorBrowserRegistry {
	// --- Editor Contributions
	export function registerEditorContribution(ctor:ISimpleEditorContributionCtor): void {
		(<EditorContributionRegistry>Registry.as(Extensions.EditorContributions)).registerEditorBrowserContribution(ctor);
	}
	export function getEditorContributions(): IEditorContributionDescriptor[] {
		return (<EditorContributionRegistry>Registry.as(Extensions.EditorContributions)).getEditorBrowserContributions();
	}
}

class SimpleEditorContributionDescriptor implements IEditorContributionDescriptor {
	private _ctor:ISimpleEditorContributionCtor;

	constructor(ctor:ISimpleEditorContributionCtor) {
		this._ctor = ctor;
	}

	public createInstance(instantiationService:IInstantiationService, editor:ICodeEditor): IEditorContribution {
		// cast added to help the compiler, can remove once IConstructorSignature1 has been removed
		return instantiationService.createInstance(<IConstructorSignature1<ICodeEditor, IEditorContribution>> this._ctor, editor);
	}
}

// Editor extension points
var Extensions = {
	EditorContributions: 'editor.contributions'
};

class EditorContributionRegistry {

	private editorContributions: IEditorContributionDescriptor[];

	constructor() {
		this.editorContributions = [];
	}

	public registerEditorBrowserContribution(ctor:ISimpleEditorContributionCtor): void {
		this.editorContributions.push(new SimpleEditorContributionDescriptor(ctor));
	}

	public getEditorBrowserContributions(): IEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}
}

Registry.add(Extensions.EditorContributions, new EditorContributionRegistry());
