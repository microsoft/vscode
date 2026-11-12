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
import { FileOperationError, FileOperationResult, IFileContent, IFileService, toFileOperationResult } from '../../../files/common/files.js';

const writes = new SequencerByKey<string>();

/** Reads explicit repository choices without resolving inherited activation or policy. */
export async function readCopilotRepositoryPluginEnablement(fileService: IFileService, workingDirectory: URI): Promise<ReadonlyMap<string, boolean>> {
	const resource = joinPath(workingDirectory, '.github', 'copilot', 'settings.json');
	let content: string;
	try {
		content = (await fileService.readFile(resource)).value.toString();
	} catch (error) {
		if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			return new Map();
		}
		throw error;
	}
	const errors: ParseError[] = [];
	const root = parseTree(content, errors);
	const plugins = root && findNodeAtLocation(root, ['enabledPlugins']);
	const result = new Map<string, boolean>();
	if (errors.length || root?.type !== 'object' || (plugins && plugins.type !== 'object')
		|| (root.children?.filter(property => property.children?.[0].value === 'enabledPlugins').length ?? 0) > 1) {
		throw new Error(localize('copilot.repositoryPluginSettings.readInvalid', "Cannot read repository plugin enablement because '{0}' is not a valid settings object.", resource.fsPath));
	}
	for (const property of plugins?.children ?? []) {
		const [key, value] = property.children ?? [];
		if (!key || !value || typeof key.value !== 'string' || typeof value.value !== 'boolean' || result.has(key.value)) {
			throw new Error(localize('copilot.repositoryPluginSettings.readInvalid', "Cannot read repository plugin enablement because '{0}' is not a valid settings object.", resource.fsPath));
		}
		result.set(key.value, value.value);
	}
	return result;
}

/** Writes a repository decision relative to the chat's SDK working directory. */
// TODO: Replace direct repository settings edits with the SDK repository plugin enablement API: https://github.com/github/copilot-agent-runtime/issues/37954
export function setCopilotRepositoryPluginEnabled(fileService: IFileService, workingDirectory: URI, pluginSpec: string, enabled: boolean | null): Promise<void> {
	const resource = joinPath(workingDirectory, '.github', 'copilot', 'settings.json');
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
		const value = enabled ?? undefined;
		if (findNodeAtLocation(root, ['enabledPlugins', pluginSpec])?.value === value) {
			return;
		}

		const updated = applyEdits(content, setProperty(content, ['enabledPlugins', pluginSpec], value, {
			insertSpaces: true,
			tabSize: 2,
			eol: content.includes('\r\n') ? '\r\n' : '\n',
		}));
		const buffer = VSBuffer.fromString(updated);
		if (file) {
			// Metadata conflict checks can miss same-size edits; compare content within our write queue.
			const current = await fileService.readFile(resource);
			if (!current.value.equals(file.value)) {
				throw new FileOperationError(localize('copilot.repositoryPluginSettings.modified', "Cannot change plugin enablement because '{0}' has changed. Please retry.", resource.fsPath), FileOperationResult.FILE_MODIFIED_SINCE);
			}
			await fileService.writeFile(resource, buffer, { mtime: file.mtime, etag: file.etag });
		} else {
			await fileService.createFile(resource, buffer, { overwrite: false });
		}
	});
}
