/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { findNodeAtLocation, ParseError, parseTree } from '../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { extUriBiasedIgnorePathCase, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileContent, IFileService, toFileOperationResult } from '../../../files/common/files.js';

const writes = new SequencerByKey<string>();

/** Writes a repository decision without interpreting the runtime's settings precedence or policy. */
// TODO: Replace direct repository settings edits with the SDK repository plugin enablement API: https://github.com/github/copilot-agent-runtime/issues/37954
export function setCopilotRepositoryPluginEnabled(fileService: IFileService, repository: URI, pluginSpec: string, enabled: boolean): Promise<void> {
	const resource = joinPath(repository, '.github', 'copilot', 'settings.json');
	return writes.queue(extUriBiasedIgnorePathCase.getComparisonKey(resource), async () => {
		let file: IFileContent | undefined;
		try {
			file = await fileService.readFile(resource);
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}

		const content = file?.value.toString() ?? '{}';
		const errors: ParseError[] = [];
		const root = parseTree(content, errors);
		const plugins = root && findNodeAtLocation(root, ['enabledPlugins']);
		const duplicateSettings = (root?.children?.filter(property => property.children?.[0].value === 'enabledPlugins').length ?? 0) > 1;
		const duplicatePlugin = (plugins?.children?.filter(property => property.children?.[0].value === pluginSpec).length ?? 0) > 1;
		if (errors.length || root?.type !== 'object' || (plugins && plugins.type !== 'object') || duplicateSettings || duplicatePlugin) {
			throw new Error(localize('copilot.repositoryPluginSettings.invalid', "Cannot change plugin enablement because '{0}' is not a valid settings object.", resource.fsPath));
		}
		if (findNodeAtLocation(root, ['enabledPlugins', pluginSpec])?.value === enabled) {
			return;
		}

		const updated = applyEdits(content, setProperty(content, ['enabledPlugins', pluginSpec], enabled, {
			insertSpaces: true,
			tabSize: 2,
			eol: content.includes('\r\n') ? '\r\n' : '\n',
		}));
		const buffer = VSBuffer.fromString(updated);
		if (file) {
			await fileService.writeFile(resource, buffer, { mtime: file.mtime, etag: file.etag });
		} else {
			await fileService.createFile(resource, buffer, { overwrite: false });
		}
	});
}
