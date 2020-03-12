/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { QuickCommandNLS } from 'vs/editor/common/standaloneStrings';
import { ICommandQuickPick } from 'vs/platform/quickinput/browser/commandsQuickAccess';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AbstractEditorCommandsQuickAccessProvider } from 'vs/editor/contrib/quickAccess/commandsQuickAccess';
import { IEditor } from 'vs/editor/common/editorCommon';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class StandaloneCommandsQuickAccessProvider extends AbstractEditorCommandsQuickAccessProvider {

	get activeTextEditorControl(): IEditor | undefined { return withNullAsUndefined(this.codeEditorService.getFocusedCodeEditor()); }

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService
	) {
		super({ showAlias: false }, instantiationService, keybindingService, commandService, telemetryService, notificationService);
	}

	protected async getCommandPicks(): Promise<Array<ICommandQuickPick>> {
		return this.getCodeEditorCommandPicks();
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneCommandsQuickAccessProvider,
	prefix: StandaloneCommandsQuickAccessProvider.PREFIX,
	helpEntries: [{ description: QuickCommandNLS.quickCommandHelp, needsEditor: true }]
});
