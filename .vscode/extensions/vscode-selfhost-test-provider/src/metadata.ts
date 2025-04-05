/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TestMessage } from 'vscode';

export interface TestMessageMetadata {
	expectedValue: unknown;
	actualValue: unknown;
}

const cache = new Array<{ id: string; metadata: TestMessageMetadata }>();

let id = 0;

function getId(): string {
	return `msg:${id++}:`;
}

const regexp = /msg:\d+:/;

export function attachTestMessageMetadata(
	message: TestMessage,
	metadata: TestMessageMetadata
): void {
	const existingMetadata = getTestMessageMetadata(message);
	if (existingMetadata) {
		Object.assign(existingMetadata, metadata);
		return;
	}

	const id = getId();

	if (typeof message.message === 'string') {
		message.message = `${message.message}\n${id}`;
	} else {
		message.message.appendText(`\n${id}`);
	}

	cache.push({ id, metadata });
	while (cache.length > 100) {
		cache.shift();
	}
}

export function getTestMessageMetadata(message: TestMessage): TestMessageMetadata | undefined {
	let value: string;
	if (typeof message.message === 'string') {
		value = message.message;
	} else {
		value = message.message.value;
	}

	const result = regexp.exec(value);
	if (!result) {
		return undefined;
	}

	const id = result[0];
	return cache.find(c => c.id === id)?.metadata;
}
