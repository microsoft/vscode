/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostChatSkillsShape, IMainContext, MainContext, MainThreadChatSkillsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatSkillData, IChatSkillDelta } from 'vs/workbench/contrib/chat/common/chatSkillsService';
import type * as vscode from 'vscode';

export class ExtHostChatSkills implements ExtHostChatSkillsShape {
	/** A map of skills that were registered in this EH */
	private readonly _registeredSkills = new Map<string, { extension: IExtensionDescription; skill: vscode.ChatSkill }>();
	private readonly _proxy: MainThreadChatSkillsShape;

	/** A map of all known skills, from other EHs or registered in vscode core */
	private readonly _allSkills = new Map<string, IChatSkillData>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatSkills);

		this._proxy.$getSkills().then(skills => {
			for (const skill of skills) {
				this._allSkills.set(skill.name, skill);
			}
		});
	}

	async invokeSkill(name: string, parameters: any, token: CancellationToken): Promise<any> {
		// Making the round trip here because not all skills were necessarily registered in this EH
		return await this._proxy.$invokeSkill(name, parameters, token);
	}

	async $acceptSkillDelta(delta: IChatSkillDelta): Promise<void> {
		if (delta.added) {
			this._allSkills.set(delta.added.name, delta.added);
		}

		if (delta.removed) {
			this._allSkills.delete(delta.removed);
		}
	}

	get skills(): vscode.ChatSkillDescription[] {
		return Array.from(this._allSkills.values());
	}

	async $invokeSkill(name: string, parameters: any, token: CancellationToken): Promise<any> {
		const item = this._registeredSkills.get(name);
		if (!item) {
			return;
		}
		try {
			return await item.skill.resolve(parameters, token);
		} catch (err) {
			onUnexpectedExternalError(err);
		}
	}

	registerChatSkill(extension: IExtensionDescription, skill: vscode.ChatSkill): IDisposable {
		this._registeredSkills.set(skill.name, { extension, skill });
		this._proxy.$registerSkill(skill);

		return toDisposable(() => {
			this._registeredSkills.delete(skill.name);
			this._proxy.$unregisterSkill(skill.name);
		});
	}
}
