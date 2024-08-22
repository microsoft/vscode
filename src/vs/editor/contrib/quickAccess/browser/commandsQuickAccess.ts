/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripIcons } from '../../../../base/common/iconLabels';
import { IEditor } from '../../../common/editorCommon';
import { ILocalizedString } from '../../../../nls';
import { isLocalizedString } from '../../../../platform/action/common/action';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding';
import { AbstractCommandsQuickAccessProvider, ICommandQuickPick, ICommandsQuickAccessOptions } from '../../../../platform/quickinput/browser/commandsQuickAccess';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';

export abstract class AbstractEditorCommandsQuickAccessProvider extends AbstractCommandsQuickAccessProvider {

	constructor(
		options: ICommandsQuickAccessOptions,
		instantiationService: IInstantiationService,
		keybindingService: IKeybindingService,
		commandService: ICommandService,
		telemetryService: ITelemetryService,
		dialogService: IDialogService
	) {
		super(options, instantiationService, keybindingService, commandService, telemetryService, dialogService);
	}

	/**
	 * Subclasses to provide the current active editor control.
	 */
	protected abstract activeTextEditorControl: IEditor | undefined;

	protected getCodeEditorCommandPicks(): ICommandQuickPick[] {
		const activeTextEditorControl = this.activeTextEditorControl;
		if (!activeTextEditorControl) {
			return [];
		}

		const editorCommandPicks: ICommandQuickPick[] = [];
		for (const editorAction of activeTextEditorControl.getSupportedActions()) {
			let commandDescription: undefined | ILocalizedString;
			if (editorAction.metadata?.description) {
				if (isLocalizedString(editorAction.metadata.description)) {
					commandDescription = editorAction.metadata.description;
				} else {
					commandDescription = { original: editorAction.metadata.description, value: editorAction.metadata.description };
				}
			}
			editorCommandPicks.push({
				commandId: editorAction.id,
				commandAlias: editorAction.alias,
				commandDescription,
				label: stripIcons(editorAction.label) || editorAction.id,
			});
		}

		return editorCommandPicks;
	}
}
