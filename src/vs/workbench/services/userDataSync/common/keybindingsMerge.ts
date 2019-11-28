/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse } from 'vs/base/common/json';
import { IUserFriendlyKeybinding, IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IUserKeybindingsResolverService } from 'vs/platform/userDataSync/common/userDataSync';
import { IStringDictionary } from 'vs/base/common/collections';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class UserKeybindingsResolverService implements IUserKeybindingsResolverService {

	_serviceBrand: undefined;

	constructor(
		@IKeybindingService private readonly keybindingsService: IKeybindingService
	) { }

	public async resolveUserKeybindings(localContent: string, remoteContent: string, baseContent: string | null): Promise<IStringDictionary<string>> {
		const local = <IUserFriendlyKeybinding[]>parse(localContent);
		const remote = <IUserFriendlyKeybinding[]>parse(remoteContent);
		const base = baseContent ? <IUserFriendlyKeybinding[]>parse(baseContent) : null;
		const keys: IStringDictionary<string> = {};
		for (const keybinding of [...local, ...remote, ...(base || [])]) {
			keys[keybinding.key] = this.keybindingsService.resolveUserBinding(keybinding.key).map(part => part.getUserSettingsLabel()).join(' ');
		}
		return keys;
	}
}

registerSingleton(IUserKeybindingsResolverService, UserKeybindingsResolverService);
