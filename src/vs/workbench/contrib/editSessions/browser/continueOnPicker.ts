/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuRegistry } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IContinueOnPicker = createDecorator<IContinueOnPicker>('IContinueOnPicker');
export interface IContinueOnPicker {
	_serviceBrand: undefined;

	pick(): Promise<URI | 'noDestinationUri' | undefined>;
}

export class ContinueOnPicker extends Disposable implements IContinueOnPicker {
	_serviceBrand = undefined;

	private continueEditSessionOptions: ContinueEditSessionItem[] = [];

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.registerContributedEditSessionOptions();
	}

	private registerContributedEditSessionOptions() {
		continueEditSessionExtPoint.setHandler(extensions => {
			const continueEditSessionOptions: ContinueEditSessionItem[] = [];
			for (const extension of extensions) {
				if (!isProposedApiEnabled(extension.description, 'contribEditSessions')) {
					continue;
				}
				if (!Array.isArray(extension.value)) {
					continue;
				}
				for (const contribution of extension.value) {
					const command = MenuRegistry.getCommand(contribution.command);
					if (!command) {
						return;
					}

					const icon = command.icon;
					const title = typeof command.title === 'string' ? command.title : command.title.value;

					continueEditSessionOptions.push(new ContinueEditSessionItem(
						ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title,
						command.id,
						command.source,
						ContextKeyExpr.deserialize(contribution.when)
					));
				}
			}
			this.continueEditSessionOptions = continueEditSessionOptions;
		});
	}

	async pick(): Promise<URI | 'noDestinationUri' | undefined> {
		const quickPick = this.quickInputService.createQuickPick<ContinueEditSessionItem>();

		const workspaceContext = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER
			? this.contextService.getWorkspace().folders[0].name
			: this.contextService.getWorkspace().folders.map((folder) => folder.name).join(', ');
		quickPick.title = localize('continueEditSessionPick.title', "Continue {0} on", `'${workspaceContext}'`);
		quickPick.placeholder = localize('continueEditSessionPick.placeholder', 'Choose how you would like to continue working');
		quickPick.items = this.createPickItems();

		const command = await new Promise<string | undefined>((resolve, reject) => {
			quickPick.onDidHide(() => resolve(undefined));

			quickPick.onDidAccept((e) => {
				const selection = quickPick.activeItems[0].command;
				resolve(selection);
				quickPick.hide();
			});

			quickPick.show();
		});

		quickPick.dispose();

		if (command === undefined) {
			return undefined;
		}

		try {
			const uri = await this.commandService.executeCommand(command);

			// Some continue on commands do not return a URI
			// to support extensions which want to be in control
			// of how the destination is opened
			if (uri === undefined) { return 'noDestinationUri'; }

			return URI.isUri(uri) ? uri : undefined;
		} catch (ex) {
			return undefined;
		}
	}

	private createPickItems(): ContinueEditSessionItem[] {
		const items = [...this.continueEditSessionOptions].filter((option) => option.when === undefined || this.contextKeyService.contextMatchesRules(option.when));
		return items.sort((item1, item2) => item1.label.localeCompare(item2.label));
	}
}

class ContinueEditSessionItem implements IQuickPickItem {
	constructor(
		public readonly label: string,
		public readonly command: string,
		public readonly description?: string,
		public readonly when?: ContextKeyExpression,
	) { }
}

interface ICommand {
	command: string;
	group: string;
	when: string;
}

const continueEditSessionExtPoint = ExtensionsRegistry.registerExtensionPoint<ICommand[]>({
	extensionPoint: 'continueEditSession',
	jsonSchema: {
		description: localize('continueEditSessionExtPoint', 'Contributes options for continuing the current edit session in a different environment'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				command: {
					description: localize('continueEditSessionExtPoint.command', 'Identifier of the command to execute. The command must be declared in the \'commands\'-section and return a URI representing a different environment where the current edit session can be continued.'),
					type: 'string'
				},
				group: {
					description: localize('continueEditSessionExtPoint.group', 'Group into which this item belongs.'),
					type: 'string'
				},
				when: {
					description: localize('continueEditSessionExtPoint.when', 'Condition which must be true to show this item.'),
					type: 'string'
				}
			},
			required: ['command']
		}
	}
});
