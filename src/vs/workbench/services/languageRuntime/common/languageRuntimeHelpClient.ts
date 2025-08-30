/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';
import { ErdosHelpComm, ShowHelpEvent } from './erdosHelpComm.js';

export class HelpClientInstance extends Disposable {

	private readonly _comm: ErdosHelpComm;

	constructor(
		client: IRuntimeClientInstance<any, any>,
		readonly languageId: string
	) {
		super();
		this._comm = new ErdosHelpComm(client, { 
			search_help_topics: { timeout: 30000 } // 30 seconds for initial cache warming
		});
		this._register(this._comm);

		this.onDidEmitHelpContent = this._comm.onDidShowHelp;
		this.onDidClose = this._comm.onDidClose;
	}

	async showHelpTopic(topic: string): Promise<boolean> {
		return this._comm.showHelpTopic(topic);
	}

	async searchHelpTopics(query: string): Promise<Array<string>> {
		return this._comm.searchHelpTopics(query);
	}

	onDidEmitHelpContent: Event<ShowHelpEvent>;

	onDidClose: Event<void>;
}


