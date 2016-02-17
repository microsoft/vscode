/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Platform = require('vs/platform/platform');
import {IInstantiationService, INewConstructorSignature1} from 'vs/platform/instantiation/common/instantiation';

export namespace EditorBrowserRegistry {
	// --- Editor Contributions
	export function registerEditorContribution(ctor:EditorBrowser.ISimpleEditorContributionCtor): void {
		(<EditorContributionRegistry>Platform.Registry.as(Extensions.EditorContributions)).registerEditorBrowserContribution(ctor);
	}
	export function getEditorContributions(): EditorBrowser.IEditorContributionDescriptor[] {
		return (<EditorContributionRegistry>Platform.Registry.as(Extensions.EditorContributions)).getEditorBrowserContributions();
	}
}

class SimpleEditorContributionDescriptor implements EditorBrowser.IEditorContributionDescriptor {
	private _ctor:EditorBrowser.ISimpleEditorContributionCtor;

	constructor(ctor:EditorBrowser.ISimpleEditorContributionCtor) {
		this._ctor = ctor;
	}

	public createInstance(instantiationService:IInstantiationService, editor:EditorBrowser.ICodeEditor): EditorCommon.IEditorContribution {
		// cast added to help the compiler, can remove once IConstructorSignature1 has been removed
		return instantiationService.createInstance(<INewConstructorSignature1<EditorBrowser.ICodeEditor, EditorCommon.IEditorContribution>> this._ctor, editor);
	}
}

// Editor extension points
var Extensions = {
	EditorContributions: 'editor.contributions'
};

class EditorContributionRegistry {

	private editorContributions: EditorBrowser.IEditorContributionDescriptor[];

	constructor() {
		this.editorContributions = [];
	}

	public registerEditorBrowserContribution(ctor:EditorBrowser.ISimpleEditorContributionCtor): void {
		this.editorContributions.push(new SimpleEditorContributionDescriptor(ctor));
	}

	public getEditorBrowserContributions(): EditorBrowser.IEditorContributionDescriptor[] {
		return this.editorContributions.slice(0);
	}
}

Platform.Registry.add(Extensions.EditorContributions, new EditorContributionRegistry());
