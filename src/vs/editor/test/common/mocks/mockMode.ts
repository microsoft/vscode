/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ModesRegistry } from 'vs/editor/common/languages/modesRegistry';
import { ILanguageSelection } from 'vs/editor/common/languages/language';

export class MockMode extends Disposable {
	constructor(
		public readonly languageId: string
	) {
		super();
		this._register(ModesRegistry.registerLanguage({ id: languageId }));
	}
}

export class StaticLanguageSelector implements ILanguageSelection {
	readonly onDidChange: Event<string> = Event.None;
	constructor(public readonly languageId: string) { }
}
