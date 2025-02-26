/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableInfo } from '../common/environmentVariable.js';
import { ITerminalStatus, ITerminalStatusHoverAction, TerminalCommandId } from '../common/terminal.js';
import { ITerminalService } from './terminal.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { EnvironmentVariableScope, IExtensionOwnedEnvironmentVariableMutator, IMergedEnvironmentVariableCollection, IMergedEnvironmentVariableCollectionDiff } from '../../../../platform/terminal/common/environmentVariable.js';
import { TerminalStatus } from './terminalStatusList.js';
import Severity from '../../../../base/common/severity.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

export class EnvironmentVariableInfoStale implements IEnvironmentVariableInfo {
	readonly requiresAction = true;

	constructor(
		private readonly _diff: IMergedEnvironmentVariableCollectionDiff,
		private readonly _terminalId: number,
		private readonly _collection: IMergedEnvironmentVariableCollection,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
	}

	private _getInfo(scope: EnvironmentVariableScope | undefined): string {
		const extSet: Set<string> = new Set();
		addExtensionIdentifiers(extSet, this._diff.added.values());
		addExtensionIdentifiers(extSet, this._diff.removed.values());
		addExtensionIdentifiers(extSet, this._diff.changed.values());

		let message = localize('extensionEnvironmentContributionInfoStale', "The following extensions want to relaunch the terminal to contribute to its environment:");
		message += getMergedDescription(this._collection, scope, this._extensionService, extSet);
		return message;
	}

	private _getActions(): ITerminalStatusHoverAction[] {
		return [{
			label: localize('relaunchTerminalLabel', "Relaunch Terminal"),
			run: () => this._terminalService.getInstanceFromId(this._terminalId)?.relaunch(),
			commandId: TerminalCommandId.Relaunch
		}];
	}

	getStatus(scope: EnvironmentVariableScope | undefined): ITerminalStatus {
		return {
			id: TerminalStatus.RelaunchNeeded,
			severity: Severity.Warning,
			icon: Codicon.warning,
			tooltip: this._getInfo(scope),
			hoverActions: this._getActions()
		};
	}
}

export class EnvironmentVariableInfoChangesActive implements IEnvironmentVariableInfo {
	readonly requiresAction = false;

	constructor(
		private readonly _collection: IMergedEnvironmentVariableCollection,
		@ICommandService private readonly _commandService: ICommandService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
	}

	private _getInfo(scope: EnvironmentVariableScope | undefined): string {
		const extSet: Set<string> = new Set();
		addExtensionIdentifiers(extSet, this._collection.getVariableMap(scope).values());

		let message = localize('extensionEnvironmentContributionInfoActive', "The following extensions have contributed to this terminal's environment:");
		message += getMergedDescription(this._collection, scope, this._extensionService, extSet);
		return message;
	}

	private _getActions(scope: EnvironmentVariableScope | undefined): ITerminalStatusHoverAction[] {
		return [{
			label: localize('showEnvironmentContributions', "Show Environment Contributions"),
			run: () => this._commandService.executeCommand(TerminalCommandId.ShowEnvironmentContributions, scope),
			commandId: TerminalCommandId.ShowEnvironmentContributions
		}];
	}

	getStatus(scope: EnvironmentVariableScope | undefined): ITerminalStatus {
		return {
			id: TerminalStatus.EnvironmentVariableInfoChangesActive,
			severity: Severity.Info,
			tooltip: this._getInfo(scope),
			hoverActions: this._getActions(scope)
		};
	}
}

function getMergedDescription(collection: IMergedEnvironmentVariableCollection, scope: EnvironmentVariableScope | undefined, extensionService: IExtensionService, extSet: Set<string>): string {
	const message = ['\n'];
	const globalDescriptions = collection.getDescriptionMap(undefined);
	const workspaceDescriptions = collection.getDescriptionMap(scope);
	for (const ext of extSet) {
		const globalDescription = globalDescriptions.get(ext);
		if (globalDescription) {
			message.push(`\n- \`${getExtensionName(ext, extensionService)}\``);
			message.push(`: ${globalDescription}`);
		}
		const workspaceDescription = workspaceDescriptions.get(ext);
		if (workspaceDescription) {
			// Only show '(workspace)' suffix if there is already a description for the extension.
			const workspaceSuffix = globalDescription ? ` (${localize('ScopedEnvironmentContributionInfo', 'workspace')})` : '';
			message.push(`\n- \`${getExtensionName(ext, extensionService)}${workspaceSuffix}\``);
			message.push(`: ${workspaceDescription}`);
		}
		if (!globalDescription && !workspaceDescription) {
			message.push(`\n- \`${getExtensionName(ext, extensionService)}\``);
		}
	}
	return message.join('');
}

function addExtensionIdentifiers(extSet: Set<string>, diff: IterableIterator<IExtensionOwnedEnvironmentVariableMutator[]>): void {
	for (const mutators of diff) {
		for (const mutator of mutators) {
			extSet.add(mutator.extensionIdentifier);
		}
	}
}

function getExtensionName(id: string, extensionService: IExtensionService): string {
	return extensionService.extensions.find(e => e.id === id)?.displayName || id;
}
