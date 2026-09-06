/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptReference } from '@vscode/prompt-tsx';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { formatHexdump, isBinaryContent } from '../../../../util/common/hexdump';
import { Schemas } from '../../../../util/vs/base/common/network';
import { Uri } from '../../../../vscodeTypes';
import { Tag } from '../base/tag';
import { CodeBlock } from './safeElements';

export interface BinaryFileData {
	readonly data: Uint8Array;
}

export interface HexdumpIfBinaryOptions {
	/** If provided, files already open as text documents are assumed to be text and skipped. */
	readonly openTextDocuments?: readonly { readonly uri: Uri }[];
}

// Known binary extensions that don't trip the usual nul-byte detection
const knownBinaryFileExtensions = new Set([
	'.pdf',
]);

/**
 * Reads a file and returns its raw bytes if the content is binary.
 * Returns `undefined` for text files, notebook cell URIs, or files already open
 * as text documents, so callers can fall through to normal text handling.
 */
export async function hexdumpIfBinary(fileService: IFileSystemService, uri: Uri, options?: HexdumpIfBinaryOptions): Promise<BinaryFileData | undefined> {
	if (uri.scheme === Schemas.vscodeNotebookCell || uri.scheme === Schemas.vscodeNotebookCellOutput) {
		return undefined;
	}

	if (options?.openTextDocuments?.some(doc => doc.uri.toString() === uri.toString())) {
		return undefined;
	}

	try {
		const buffer = await fileService.readFile(uri);
		const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		const extDot = uri.path.lastIndexOf('.');
		const ext = extDot >= 0 ? uri.path.substring(extDot).toLowerCase() : '';
		if (isBinaryContent(data) || knownBinaryFileExtensions.has(ext)) {
			return { data };
		}
	} catch {
		// fall through
	}
	return undefined;
}

export interface BinaryFileHexdumpProps extends BasePromptElementProps {
	uri: Uri;
	data: Uint8Array;
	startByte?: number;
	endByte?: number;
	variableName?: string;
	description?: string;
	omitReferences?: boolean;
}

const MAX_HEXDUMP_BYTES = 512;

export class BinaryFileHexdump extends PromptElement<BinaryFileHexdumpProps> {
	override async render() {
		const { uri, data, startByte = 0, endByte = startByte + 128 } = this.props;
		let start = startByte ?? 0;
		let end = endByte ?? data.length;
		if (start > end) {
			[end, start] = [start, end];
		}
		start = Math.max(0, start);
		end = Math.min(end, data.length, start + MAX_HEXDUMP_BYTES);

		const truncated = start !== (startByte ?? 0) || end !== (endByte ?? data.length);
		const hexdump = formatHexdump(data, start, end - start);
		const references = this.props.omitReferences ? undefined : [new PromptReference(this.props.variableName ? { variableName: this.props.variableName, value: uri } : uri)];

		return (
			<Tag name='attachment' attrs={{ id: this.props.variableName, startByte: start, endByte: end, totalSize: data.length, truncated, description: this.props.description }}>
				<CodeBlock uri={uri} references={references} code={hexdump} languageId='' fence='' />
			</Tag>
		);
	}
}
