/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file
// TSCode Welcome Page - Custom welcome page based on GettingStartedPage

import { GettingStartedPage } from './gettingStarted.js';
import { TscodeWelcomeInput } from './tscodeWelcomeInput.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class TscodeWelcomePage extends GettingStartedPage {
	// Note: Cannot override parent class static ID, so we use a different ID during registration
}

export class TscodeWelcomeInputSerializer implements IEditorSerializer {
	public canSerialize(_editorInput: TscodeWelcomeInput): boolean {
		return true;
	}

	public serialize(editorInput: TscodeWelcomeInput): string {
		return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): TscodeWelcomeInput {
		return instantiationService.invokeFunction(_accessor => {
			try {
				const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
				return new TscodeWelcomeInput({ selectedCategory, selectedStep });
			} catch { }
			return new TscodeWelcomeInput({});
		});
	}
}
