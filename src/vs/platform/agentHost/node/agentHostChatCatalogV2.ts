/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { stableStringify } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { IValidator, ValidationError, ValidatorBase, ValidatorType, vEnum, vNumber, vObj, vOptionalProp } from '../../../base/common/validation.js';
import { ChatInteractivity } from '../common/state/protocol/channels-chat/state.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT, AGENT_HOST_CATALOG_JSON_STRING_LENGTH_LIMIT, AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT, AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT, agentHostCatalogChangesValidator } from './agentHostCatalogProjection.js';

export const CHAT_V2_METADATA_BYTE_LIMIT = 16 * 1024;

class BoundedStringValidator extends ValidatorBase<string> {
	constructor(private readonly maximumLength: number) {
		super();
	}

	validate(content: unknown): { content: string; error: undefined } | { content: undefined; error: ValidationError } {
		return typeof content === 'string' && content.length > 0 && content.length <= this.maximumLength
			? { content, error: undefined }
			: { content: undefined, error: { message: `Expected a non-empty string of at most ${this.maximumLength} characters.` } };
	}

	getJSONSchema() {
		return { type: 'string' as const, minLength: 1, maxLength: this.maximumLength };
	}
}

const metadataValidator = vObj({
	summary: vOptionalProp(new BoundedStringValidator(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT)),
	titleSource: vOptionalProp(vEnum('user', 'agent', 'auto')),
	interactivity: vOptionalProp(vEnum(ChatInteractivity.Full, ChatInteractivity.ReadOnly, ChatInteractivity.Hidden)),
	changes: vOptionalProp(agentHostCatalogChangesValidator),
});
const payloadValidator = vObj({ metadataVersion: vNumber(), data: metadataValidator });

export type IAgentHostChatV2MetadataData = ValidatorType<typeof metadataValidator>;

export function encodeChatV2Metadata(data: IAgentHostChatV2MetadataData): string {
	const normalized = metadataValidator.validate(data);
	if (normalized.error) {
		throw new Error(`Invalid chat metadata: ${normalized.error.message}`);
	}
	const payload = stableStringify({ metadataVersion: 1, data: normalized.content });
	if (Buffer.byteLength(payload, 'utf8') > CHAT_V2_METADATA_BYTE_LIMIT) {
		throw new Error(`Chat metadata exceeds ${CHAT_V2_METADATA_BYTE_LIMIT} bytes`);
	}
	return payload;
}

export function decodeChatV2Metadata(payload: string): IAgentHostChatV2MetadataData {
	if (Buffer.byteLength(payload, 'utf8') > CHAT_V2_METADATA_BYTE_LIMIT) {
		throw new Error(`Chat metadata exceeds ${CHAT_V2_METADATA_BYTE_LIMIT} bytes`);
	}
	const result = payloadValidator.validate(JSON.parse(payload));
	if (result.error) {
		throw new Error(`Invalid stored chat metadata: ${result.error.message}`);
	}
	if (result.content.metadataVersion !== 1) {
		throw new Error(`Unsupported chat metadata version ${result.content.metadataVersion}`);
	}
	return result.content.data;
}

export function hashChatV2Metadata(payload: string): string {
	return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function validateChatV2String(value: string, uri = false): void {
	const validator: IValidator<string> = new BoundedStringValidator(AGENT_HOST_CATALOG_JSON_STRING_LENGTH_LIMIT);
	const result = validator.validate(value);
	if (result.error) {
		throw new Error(result.error.message);
	}
	if (uri && !URI.parse(value, true).scheme) {
		throw new Error('Expected a URI with a scheme');
	}
}

export function validateChatV2WorkingDirectories(value: readonly string[]): void {
	if (value.length > AGENT_HOST_CATALOG_CHILD_LIMIT || new Set(value).size !== value.length) {
		throw new Error('Working directories exceed the catalog limit or contain duplicates');
	}
	for (const directory of value) {
		validateChatV2String(directory, true);
	}
	if (Buffer.byteLength(JSON.stringify(value), 'utf8') > AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT) {
		throw new Error('Working directories exceed the catalog payload byte limit');
	}
}

export function validateChatV2Origin(value: string): void {
	if (Buffer.byteLength(value, 'utf8') > AGENT_HOST_CATALOG_PAYLOAD_BYTE_LIMIT) {
		throw new Error('Chat origin exceeds the catalog payload byte limit');
	}
}
