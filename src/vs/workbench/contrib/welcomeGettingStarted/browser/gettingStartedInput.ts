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
	selectedCategory?: string;
	selectedStep?: string;
	showTelemetryNotice?: boolean;
	showWelcome?: boolean;
	walkthroughPageTitle?: string;
	showNewExperience?: boolean;
}

export class GettingStartedInput extends EditorInput {

	static readonly ID = gettingStartedInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_getting_started_page' });
	private _selectedCategory: string | undefined;
	private _selectedStep: string | undefined;
	private _showTelemetryNotice: boolean;
	private _showWelcome: boolean;
	private _showNewExperience: boolean;

	private _walkthroughPageTitle: string | undefined;

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
		options: GettingStartedEditorOptions) {
		super();
		this._selectedCategory = options.selectedCategory;
		this._selectedStep = options.selectedStep;
		this._showTelemetryNotice = !!options.showTelemetryNotice;
		this._showWelcome = options.showWelcome ?? true;
		this._walkthroughPageTitle = options.walkthroughPageTitle;
		this._showNewExperience = options.showNewExperience ?? false;
	}

	override getName() {
		return this.walkthroughPageTitle ? localize('walkthroughPageTitle', 'Walkthrough: {0}', this.walkthroughPageTitle) : localize('getStarted', "Welcome");
	}

	get selectedCategory() {
		return this._selectedCategory;
	}

	set selectedCategory(selectedCategory: string | undefined) {
		this._selectedCategory = selectedCategory;
		this._onDidChangeLabel.fire();
	}

	get selectedStep() {
		return this._selectedStep;
	}

	set selectedStep(selectedStep: string | undefined) {
		this._selectedStep = selectedStep;
	}

	get showTelemetryNotice(): boolean {
		return this._showTelemetryNotice;
	}

	set showTelemetryNotice(value: boolean) {
		this._showTelemetryNotice = value;
	}

	get showWelcome(): boolean {
		return this._showWelcome;
	}

	set showWelcome(value: boolean) {
		this._showWelcome = value;
	}

	get walkthroughPageTitle(): string | undefined {
		return this._walkthroughPageTitle;
	}

	set walkthroughPageTitle(value: string | undefined) {
		this._walkthroughPageTitle = value;
	}

	get showNewExperience(): boolean {
		return this._showNewExperience;
	}

	set showNewExperience(value: boolean) {
		this._showNewExperience = value;
	}
}
