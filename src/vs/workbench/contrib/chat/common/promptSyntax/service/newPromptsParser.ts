/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLines } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import { parse, YamlNode, YamlParseError } from '../../../../../../base/common/yaml.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IPromptParserResult } from './promptsService.js';

export class NewPromptsParser {
	constructor(
		private readonly modelService: IModelService,
		private readonly fileService: IFileService,
	) {
		// TODO
	}

	public async parse(uri: URI): Promise<IPromptParserResult | undefined> {
		const content = await this.getContents(uri);
		if (!content) {
			return;
		}
		const lines = splitLines(content);
		if (lines.length === 0) {
			return createResult(uri, undefined, []);
		}
		let header: PromptHeader | undefined = undefined;
		let body: { references: URI[] } | undefined = undefined;
		let bodyStart = 0;
		if (lines[0] === '---') {
			let headerEnd = lines.indexOf('---', 1);
			if (headerEnd === -1) {
				headerEnd = lines.length;
				bodyStart = lines.length;
			} else {
				bodyStart = headerEnd + 1;
			}
			header = this.parseHeader(lines.slice(1, headerEnd !== -1 ? headerEnd : lines.length));
		}
		if (bodyStart < lines.length) {
			body = this.parseBody(lines.slice(bodyStart));
		}
		return createResult(uri, header, body?.references ?? []);
	}

	private parseBody(lines: string[]): { references: URI[] } {
		const references: URI[] = [];
		for (const line of lines) {
			const match = line.match(/\[(.+?)\]\((.+?)\)/);
			if (match) {
				const [, _text, uri] = match;
				references.push(URI.file(uri));
			}
		}
		return { references };
	}

	private parseHeader(lines: string[]): PromptHeader {
		const errors: YamlParseError[] = [];
		const node = parse(lines, errors);
		return new PromptHeader(node, errors);
	}

	private async getContents(uri: URI): Promise<string | undefined> {
		const model = this.modelService.getModel(uri);
		if (model) {
			return model.getValue();
		}
		const content = await this.fileService.readFile(uri);
		if (content) {
			return content.value.toString();
		}
		return undefined;
	}
}

function createResult(uri: URI, header: PromptHeader | undefined, references: URI[]): IPromptParserResult {
	return {
		uri,
		header,
		references,
		metadata: null
	};
}

export class PromptHeader {
	constructor(public readonly node: YamlNode | undefined, public readonly errors: YamlParseError[]) {

	}
}

