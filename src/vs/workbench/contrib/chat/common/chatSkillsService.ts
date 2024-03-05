/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IChatSkillData {
	name: string;
	description: string;
	parametersSchema: Object;
}

export interface IChatSkill extends IChatSkillData {
	invoke(parameters: any, token: CancellationToken): Promise<any | undefined>;
}

export const IChatSkillsService = createDecorator<IChatSkillsService>('IChatSkillsService');

export interface IChatSkillDelta {
	added?: IChatSkillData;
	removed?: string;
}

export interface IChatSkillsService {
	_serviceBrand: undefined;
	onDidChangeSkills: Event<IChatSkillDelta>;
	registerSkill(skill: IChatSkill): IDisposable;
	getSkills(): Iterable<Readonly<IChatSkillData>>;
	invokeSkill(name: string, parameters: any, token: CancellationToken): Promise<any>;
}

export class ChatSkillsService implements IChatSkillsService {
	_serviceBrand: undefined;

	private _onDidChangeSkills = new Emitter<IChatSkillDelta>();
	readonly onDidChangeSkills = this._onDidChangeSkills.event;

	private _skills = new Map<string, IChatSkill>();

	registerSkill(skill: IChatSkill): IDisposable {
		if (this._skills.has(skill.name)) {
			throw new Error(`Skill ${skill.name} already exists`);
		}

		this._skills.set(skill.name, skill);
		this._onDidChangeSkills.fire({ added: skill });

		return toDisposable(() => {
			this._skills.delete(skill.name);
			this._onDidChangeSkills.fire({ removed: skill.name });
		});
	}

	getSkills(): Iterable<Readonly<IChatSkillData>> {
		return this._skills.values();
	}

	invokeSkill(name: string, parameters: any, token: CancellationToken): Promise<any> {
		const skill = this._skills.get(name);
		if (!skill) {
			throw new Error(`Skill ${name} not found`);
		}

		return skill.invoke(parameters, token);
	}
}
