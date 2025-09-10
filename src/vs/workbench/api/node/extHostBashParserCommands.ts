/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtHostCommands } from '../common/extHostCommands.js';
import { IExtHostBashParserService } from '../common/extHostBashParser.js';

export function registerBashParserCommands(commands: IExtHostCommands, bashParserService: IExtHostBashParserService): void {
	commands.registerCommand(true, 'erdosAi.parseBashCommands', async (...args: any[]): Promise<any> => {
		const script = args[0] as string;
		const result = await bashParserService.$parseBashCommands(script);
		return result;
	});
}
