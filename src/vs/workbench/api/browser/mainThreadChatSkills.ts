/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ExtHostChatSkillsShape, ExtHostContext, MainContext, MainThreadChatSkillsShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatSkillData, IChatSkillsService } from 'vs/workbench/contrib/chat/common/chatSkillsService';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatSkills)
export class MainThreadChatSkills extends Disposable implements MainThreadChatSkillsShape {

	private readonly _proxy: ExtHostChatSkillsShape;
	private readonly _skills = this._register(new DisposableMap<string>());

	constructor(
		extHostContext: IExtHostContext,
		@IChatSkillsService private readonly _chatSkillsService: IChatSkillsService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatSkills);

		this._register(this._chatSkillsService.onDidChangeSkills(e => this._proxy.$acceptSkillDelta(e)));
	}

	async $getSkills(): Promise<IChatSkillData[]> {
		return Array.from(this._chatSkillsService.getSkills());
	}

	$invokeSkill(name: string, parameters: any, token: CancellationToken): Promise<string | undefined> {
		return this._chatSkillsService.invokeSkill(name, parameters, token);
	}

	$registerSkill(data: IChatSkillData): void {
		const disposable = this._chatSkillsService.registerSkill({
			...data,
			invoke: async (parameters, token) => {
				return await this._proxy.$invokeSkill(data.name, parameters, token);
			},
		});
		this._skills.set(data.name, disposable);
	}

	$unregisterSkill(name: string): void {
		this._skills.deleteAndDispose(name);
	}
}
