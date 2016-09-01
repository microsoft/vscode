/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IInstantiationService, IConstructorSignature1} from 'vs/platform/instantiation/common/instantiation';
import {Registry} from 'vs/platform/platform';
import {IEditorContribution} from 'vs/editor/common/editorCommon';
import {ICodeEditor, IEditorContributionDescriptor, ISimpleEditorContributionCtor} from 'vs/editor/browser/editorBrowser';

export function editorBrowserContribution(ctor:ISimpleEditorContributionCtor): void {
	EditorContributionRegistry.INSTANCE.registerEditorBrowserContribution(ctor);
}

export namespace EditorBrowserRegistry {
	// --- Editor Contributions
	export function getEditorContributions(): IEditorContributionDescriptor[] {
		return EditorContributionRegistry.INSTANCE.getEditorBrowserContributions();
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

	public static INSTANCE = new EditorContributionRegistry();

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

Registry.add(Extensions.EditorContributions, EditorContributionRegistry.INSTANCE);
