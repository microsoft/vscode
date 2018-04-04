/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vscode';

export interface Configuration {
	username: string | undefined;
	host: string;
	accessToken: string | undefined;
	onDidChange: Event<Configuration>;
}
