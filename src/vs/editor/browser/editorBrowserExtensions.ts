/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import { IEditorContributionCtor } from 'vs/editor/browser/editorBrowser';

export function editorContribution(ctor: IEditorContributionCtor): void {
	EditorContributionRegistry.INSTANCE.registerEditorBrowserContribution(ctor);
}

export namespace EditorBrowserRegistry {
	export function getEditorContributions(): IEditorContributionCtor[] {
		return EditorContributionRegistry.INSTANCE.getEditorBrowserContributions();
	}
}

const Extensions = {
	EditorContributions: 'editor.contributions'
};

class EditorContributionRegistry {

	public static INSTANCE = new EditorContributionRegistry();

	private editorContributions: IEditorContributionCtor[];

	constructor() {
		this.editorContributions = [];
	}

	public registerEditorBrowserContribution(ctor: IEditorContributionCtor): void {
		this.editorContributions.push(ctor);
	}

	public getEditorBrowserContributions(): IEditorContributionCtor[] {
		return this.editorContributions.slice(0);
	}
}

Registry.add(Extensions.EditorContributions, EditorContributionRegistry.INSTANCE);
