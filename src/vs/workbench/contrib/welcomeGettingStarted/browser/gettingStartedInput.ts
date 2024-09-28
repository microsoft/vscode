/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/gettingStarted.css';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

export const gettingStartedInputTypeId = 'workbench.editors.gettingStartedInput';

export interface GettingStartedEditorOptions extends IEditorOptions {
	selectedCategory?: string; selectedStep?: string; showTelemetryNotice?: boolean; showWelcome?: boolean;
}

export class GettingStartedInput extends EditorInput {

	static readonly ID = gettingStartedInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_getting_started_page' });

	override get typeId(): string {
		return GettingStartedInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: GettingStartedInput.RESOURCE,
			options: {
				override: GettingStartedInput.ID,
				pinned: false
			}
		};
	}

	get resource(): URI | undefined {
		return GettingStartedInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		if (other instanceof GettingStartedInput) {
			return other.selectedCategory === this.selectedCategory;
		}
		return false;
	}

	constructor(
		options: GettingStartedEditorOptions
	) {
		super();
		this.selectedCategory = options.selectedCategory;
		this.selectedStep = options.selectedStep;
		this.showTelemetryNotice = !!options.showTelemetryNotice;
		this.showWelcome = options.showWelcome ?? true;
	}

	override getName() {
		return localize('getStarted', "Welcome");
	}

	selectedCategory: string | undefined;
	selectedStep: string | undefined;
	showTelemetryNotice: boolean;
	showWelcome: boolean;
}
