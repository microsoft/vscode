/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringDecoder } from 'string_decoder';
import { listenStream } from '../../../../base/common/stream.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { getCodexRolloutThreadCoordinationCall, type ICodexThreadCoordinationCall } from './codexThreadCoordination.js';

export interface ICodexRolloutModel {
	readonly modelProvider: string;
	readonly modelId: string;
}

export interface ICodexRolloutMetadata {
	readonly isDesktop: boolean;
	readonly originModelProvider?: string;
	readonly selectedModel?: ICodexRolloutModel;
	readonly modelsByTurnId: ReadonlyMap<string, ICodexRolloutModel>;
	readonly threadCoordinationByTurnId: ReadonlyMap<string, readonly ICodexThreadCoordinationCall[]>;
}

interface ICodexRolloutRecord {
	readonly type?: string;
	readonly payload?: {
		readonly originator?: string;
		readonly model_provider?: string;
		readonly type?: string;
		readonly turn_id?: string;
		readonly model?: string;
		readonly thread_settings?: {
			readonly model?: string;
			readonly model_provider_id?: string;
		};
		readonly call_id?: string;
		readonly name?: string;
		readonly input?: string;
		readonly output?: string | readonly {
			readonly type?: string;
			readonly text?: string;
		}[];
		readonly internal_chat_message_metadata_passthrough?: {
			readonly turn_id?: string;
		};
	};
}

/** Reads the model provenance needed to restore a persisted Codex Desktop thread. */
export async function readCodexRolloutMetadata(fileService: IFileService, path: string): Promise<ICodexRolloutMetadata> {
	const stream = (await fileService.readFileStream(URI.file(path))).value;
	return new Promise<ICodexRolloutMetadata>((resolve, reject) => {
		const decoder = new StringDecoder('utf8');
		const modelsByTurnId = new Map<string, ICodexRolloutModel>();
		const threadCoordinationByTurnId = new Map<string, ICodexThreadCoordinationCall[]>();
		const pendingThreadCoordination = new Map<string, { readonly turnId: string; readonly input: string }>();
		let remainder = '';
		let isDesktop = false;
		let originModelProvider: string | undefined;
		let currentModel: ICodexRolloutModel | undefined;

		const acceptLine = (line: string) => {
			if (!line.includes('"session_meta"') && !line.includes('"turn_context"') && !line.includes('"thread_settings_applied"') && !line.includes('"task_started"') && !line.includes('custom_tool_call')) {
				return;
			}
			let record: ICodexRolloutRecord;
			try {
				record = JSON.parse(line);
			} catch {
				return;
			}
			const payload = record.payload;
			if (!payload) {
				return;
			}
			if (record.type === 'response_item') {
				if (payload.type === 'custom_tool_call' && payload.call_id && payload.input) {
					const turnId = payload.internal_chat_message_metadata_passthrough?.turn_id;
					if (turnId) {
						pendingThreadCoordination.set(payload.call_id, { turnId, input: payload.input });
					}
				} else if (payload.type === 'custom_tool_call_output' && payload.call_id) {
					const pending = pendingThreadCoordination.get(payload.call_id);
					pendingThreadCoordination.delete(payload.call_id);
					if (pending) {
						const output = typeof payload.output === 'string'
							? [payload.output]
							: payload.output?.flatMap(item => item.type === 'input_text' && typeof item.text === 'string' ? [item.text] : []) ?? [];
						const coordination = getCodexRolloutThreadCoordinationCall(pending.input, output);
						if (coordination) {
							const calls = threadCoordinationByTurnId.get(pending.turnId);
							if (calls) {
								calls.push(coordination);
							} else {
								threadCoordinationByTurnId.set(pending.turnId, [coordination]);
							}
						}
					}
				}
				return;
			}
			if (record.type === 'session_meta') {
				isDesktop = payload.originator === 'Codex Desktop';
				originModelProvider = payload.model_provider;
				return;
			}
			if (record.type === 'turn_context' && payload.turn_id && payload.model) {
				currentModel = {
					modelProvider: currentModel?.modelProvider ?? originModelProvider ?? 'openai',
					modelId: payload.model,
				};
				modelsByTurnId.set(payload.turn_id, currentModel);
				return;
			}
			if (record.type !== 'event_msg') {
				return;
			}
			if (payload.type === 'thread_settings_applied') {
				const settings = payload.thread_settings;
				if (settings?.model && settings.model_provider_id) {
					currentModel = { modelProvider: settings.model_provider_id, modelId: settings.model };
				}
				return;
			}
			if (payload.type === 'task_started' && payload.turn_id && currentModel) {
				modelsByTurnId.set(payload.turn_id, currentModel);
			}
		};

		const acceptText = (text: string, flush: boolean) => {
			remainder += text;
			let newline: number;
			while ((newline = remainder.indexOf('\n')) >= 0) {
				acceptLine(remainder.slice(0, newline));
				remainder = remainder.slice(newline + 1);
			}
			if (flush && remainder) {
				acceptLine(remainder);
				remainder = '';
			}
		};

		listenStream(stream, {
			onData: data => acceptText(decoder.write(data.buffer), false),
			onError: reject,
			onEnd: () => {
				acceptText(decoder.end(), true);
				resolve({
					isDesktop,
					originModelProvider,
					selectedModel: currentModel,
					modelsByTurnId,
					threadCoordinationByTurnId,
				});
			},
		});
	});
}
