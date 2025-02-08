/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SettingsManager } from './settings';
import type { FromWebviewMessage } from '../types/previewMessaging';

export interface MessagePoster {
	/**
	 * Post a message to the markdown extension
	 */
	postMessage<T extends FromWebviewMessage.Type>(
		type: T['type'],
		body: Omit<T, 'source' | 'type'>
	): void;
}

export const createPosterForVsCode = (vscode: any, settingsManager: SettingsManager): MessagePoster => {
	return {
		postMessage<T extends FromWebviewMessage.Type>(
			type: T['type'],
			body: Omit<T, 'source' | 'type'>
		): void {
			vscode.postMessage({
				type,
				source: settingsManager.settings!.source,
				...body
			});
		}
	};
};

