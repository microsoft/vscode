/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import type { ChatParticipantMetadata } from 'vscode';
import '../../src/extension/intents/node/allIntents';
import { ChatLocation } from '../../src/platform/chat/common/commonTypes';

export function readBuiltinIntents(location: ChatLocation) {
	const packageJson = JSON.parse(fs.readFileSync(path.resolve(path.join(__dirname, '..', 'package.json'))).toString(), undefined);
	const participantMetadata: ChatParticipantMetadata[] = [];
	for (const participant of packageJson['contributes']['chatParticipants']) {
		const locationName = location === ChatLocation.Panel ? 'panel' : location === ChatLocation.Editor ? 'editor' : undefined;
		if (!locationName || !participant.locations || !participant.locations.includes(locationName)) {
			continue;
		}
		if (participant.disambiguation?.length) {
			participantMetadata.push({
				participant: participant.id, disambiguation: participant.disambiguation
			});
		}
		if (participant.commands) {
			for (const command of participant.commands) {
				if (command.disambiguation?.length) {
					participantMetadata.push({
						participant: participant.id, command: command.name, disambiguation: command.disambiguation
					});
				}
			}
		}
	}
	return participantMetadata;
}
