/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDynamicVariable } from '../../common/chatVariables.js';
import { basename } from '../../../../../base/common/resources.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Location } from '../../../../../editor/common/languages.js';
import { PromptFileReference } from '../../common/promptFileReference.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

/**
 * Parse the `data` property of a reference as an `URI`.
 * @throws if the `data` reference is `not defined` or an invalid `URI`.
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
 * A wrapper class for an `IDynamicVariable` object that that adds functionality
 * to parse nested file references of this variable.
 * See {@link PromptFileReference} for details.
 */
export class ChatDynamicVariable extends PromptFileReference implements IDynamicVariable {
	constructor(
		private readonly reference: IDynamicVariable,
		@IFileService fileService: IFileService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super(
			parseUri(reference.data),
			fileService,
			configService,
		);
	}

	/**
	 * Get the filename of the reference with the suffix for how many nested child references
	 * the current reference has. E.g. `(+3 more)` if there are 3 child references found.
	 */
	public get filenameWithReferences(): string {
		const fileName = basename(this.uri);

		const suffix = this.validChildReferences.length
			? ` (+${this.validChildReferences.length} ${localize('more', 'more')})`
			: '';

		return `${fileName}${suffix}`;
	}

	/**
	 * Note! below are the getters that simply forward to the underlying `IDynamicVariable` object;
	 * 		 while we could implement the logic generically using the `Proxy` class here, it's hard
	 * 		 to make Typescript to recognize this generic implementation correctly
	 */

	public get id() {
		return this.reference.id;
	}

	public get range() {
		return this.reference.range;
	}

	public set range(range: IRange) {
		this.reference.range = range;
	}

	public get data(): URI {
		return this.uri;
	}

	public get prefix() {
		return this.reference.prefix;
	}

	public get isFile() {
		return this.reference.isFile;
	}

	public get fullName() {
		return this.reference.fullName;
	}

	public get modelDescription() {
		return this.reference.modelDescription;
	}
}
