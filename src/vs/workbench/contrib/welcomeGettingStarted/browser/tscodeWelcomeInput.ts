/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file

import './media/gettingStarted.css';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';

export const tscodeWelcomeInputTypeId = 'workbench.editors.tscodeWelcomeInput';

export interface TscodeWelcomeEditorOptions extends IEditorOptions {
	selectedCategory?: string;
	selectedStep?: string;
	showTelemetryNotice?: boolean;
	showWelcome?: boolean;
	walkthroughPageTitle?: string;
	showNewExperience?: boolean;
	/** Command to execute when pressing "Go Back" instead of showing the categories slide */
	returnToCommand?: string;
}

export class TscodeWelcomeInput extends EditorInput {

	static readonly ID = tscodeWelcomeInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: Schemas.walkThrough, authority: 'tscode_welcome_page' });
	private _selectedCategory: string | undefined;
	private _selectedStep: string | undefined;
	private _showTelemetryNotice: boolean;
	private _showWelcome: boolean;
	private _returnToCommand: string | undefined;

	private _walkthroughPageTitle: string | undefined;

	override get typeId(): string {
		return TscodeWelcomeInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: TscodeWelcomeInput.RESOURCE,
			options: {
				override: TscodeWelcomeInput.ID,
				pinned: false
			}
		};
	}

	get resource(): URI | undefined {
		return TscodeWelcomeInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof TscodeWelcomeInput;
	}

	constructor(
		options: TscodeWelcomeEditorOptions) {
		super();
		this._selectedCategory = options.selectedCategory;
		this._selectedStep = options.selectedStep;
		this._showTelemetryNotice = !!options.showTelemetryNotice;
		this._showWelcome = options.showWelcome ?? true;
		this._walkthroughPageTitle = options.walkthroughPageTitle;
		this._returnToCommand = options.returnToCommand;
	}

	override getName() {
		return this.walkthroughPageTitle ? localize('tscodeWalkthroughPageTitle', 'Walkthrough: {0}', this.walkthroughPageTitle) : localize('tscodeWelcome', "TestAgent Welcome");
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

	get returnToCommand(): string | undefined {
		return this._returnToCommand;
	}

	set returnToCommand(value: string | undefined) {
		this._returnToCommand = value;
	}
}
