/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import { terminalContributionsDescriptor } from './terminal.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionTerminalProfile, ITerminalCompletionProviderContribution, ITerminalContributions, ITerminalProfileContribution } from '../../../../platform/terminal/common/terminal.js';
import { URI } from '../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../base/common/event.js';

// terminal extension point
const terminalsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<ITerminalContributions>(terminalContributionsDescriptor);

export interface IExtensionTerminalCompletionProvider extends ITerminalCompletionProviderContribution {
	extensionIdentifier: string;
}

export interface ITerminalContributionService {
	readonly _serviceBrand: undefined;

	readonly terminalProfiles: ReadonlyArray<IExtensionTerminalProfile>;
	readonly terminalCompletionProviders: ReadonlyArray<IExtensionTerminalCompletionProvider>;
	readonly onDidChangeTerminalCompletionProviders: Event<void>;
}

export const ITerminalContributionService = createDecorator<ITerminalContributionService>('terminalContributionsService');

export class TerminalContributionService implements ITerminalContributionService {
	declare _serviceBrand: undefined;

	private _terminalProfiles: ReadonlyArray<IExtensionTerminalProfile> = [];
	get terminalProfiles() { return this._terminalProfiles; }

	private _terminalCompletionProviders: ReadonlyArray<IExtensionTerminalCompletionProvider> = [];
	get terminalCompletionProviders() { return this._terminalCompletionProviders; }

	private readonly _onDidChangeTerminalCompletionProviders = new Emitter<void>();
	readonly onDidChangeTerminalCompletionProviders = this._onDidChangeTerminalCompletionProviders.event;

	constructor() {
		terminalsExtPoint.setHandler(contributions => {
			this._terminalProfiles = contributions.map(c => {
				return c.value?.profiles?.filter(p => hasValidTerminalIcon(p)).map(e => {
					return { ...e, extensionIdentifier: c.description.identifier.value };
				}) || [];
			}).flat();

			this._terminalCompletionProviders = contributions.map(c => {
				return c.value?.completionProviders?.map(p => {
					return { ...p, extensionIdentifier: c.description.identifier.value };
				}) || [];
			}).flat();

			this._onDidChangeTerminalCompletionProviders.fire();
		});
	}
}

function hasValidTerminalIcon(profile: ITerminalProfileContribution): boolean {
	return !profile.icon ||
		(
			typeof profile.icon === 'string' ||
			URI.isUri(profile.icon) ||
			(
				(<{ light: URI; dark: URI }>profile.icon).light && URI.isUri(profile.icon.light) &&
				(<{ light: URI; dark: URI }>profile.icon).dark && URI.isUri(profile.icon.dark)
			)
		);
}
