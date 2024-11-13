/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IDynamicVariable } from '../../common/chatVariables.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../base/common/assert.js';
import { Location } from '../../../../../editor/common/languages.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ChatbotPromptReference } from '../chatbotPromptReference.js';

/**
 * Parse the `data` property of a reference as an `URI`.
 *
 * Throws! if the reference is not defined or an invalid `URI`.
 */
const parseUri = (data: IDynamicVariable['data']): URI | Location => {
	assertDefined(
		data,
		`The reference must have a \`data\` property, got ${data}.`,
	);

	if (typeof data === 'string') {
		return URI.parse(data);
	}

	if (data instanceof URI) {
		return data;
	}

	if ('uri' in data && data.uri instanceof URI) {
		return data.uri;
	}

	throw new Error(
		`The reference must have a \`data\` property parseable as an 'URI', got ${data}.`,
	);
};

/**
 * TODO: @legomushroom
 */
export class ChatDynamicVariable extends ChatbotPromptReference implements IDynamicVariable {
	constructor(
		private readonly reference: IDynamicVariable,
		fileService: IFileService,
	) {
		super(parseUri(reference.data), fileService);
	}

	// TODO: @legomushroom - is it possible to use a `Proxy` instead of all
	// 						 the getters and make TS happy at the same time?
	get id() {
		return this.reference.id;
	}

	get range() {
		return this.reference.range;
	}

	set range(range: IRange) {
		this.reference.range = range;
	}

	get data(): URI {
		return this.uri;
	}

	get prefix() {
		return this.reference.prefix;
	}

	get isFile() {
		return this.reference.isFile;
	}

	get fullName() {
		return this.reference.fullName;
	}

	get modelDescription() {
		return this.reference.modelDescription;
	}

	// TODO: @legomushroom - remove?
	// public override dispose() {
	// 	if (this.resolveReferencesReady) {
	// 		// unfortunately, we can't cancel the promise so
	// 		// all we do here is to delete the reference
	// 		delete this.resolveReferencesReady;
	// 	}

	// 	super.dispose();
	// }
}
