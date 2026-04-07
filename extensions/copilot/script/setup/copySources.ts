/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import * as ts from 'typescript';
const VS_ROOT = join(__dirname, '../../../vscode/src');
const TARGET = join(__dirname, '../../src/util/vs');

/**
 * Returns the absolute file path where the given file should be placed.
 */
function determineTargetPath(absoluteVSCodeFilePath: string): string {

	const vsRelative = path.relative(VS_ROOT, absoluteVSCodeFilePath);

	const segements = vsRelative.split(path.sep);

	if (segements[0] === 'typings' || segements[0] === 'vs') {
		segements.shift();
	}

	return join(TARGET, segements.join(path.sep));
}

/**
 * Returns the relative path of `importedFilePath` to `currentFilePath` in a format suitable for import statements.
 */
function createRelativeImportPath(currentFilePath: string, importedFilePath: string): string {
	const relativePath = path.relative(path.dirname(currentFilePath), importedFilePath).replaceAll('\\', '/');
	const result = relativePath.startsWith('.') ? relativePath : './' + relativePath;
	return result.replace(/\.ts$/, '');
}

async function doIt(filepaths: string[]) {
	try {
		await fs.promises.access(VS_ROOT);
	} catch {
		console.error(`❌ VS Code root not found at ${VS_ROOT}`);
		process.exit(1);
	}

	try {
		await fs.promises.rm(join(TARGET), { recursive: true });
	} catch {
		// ignore
	}

	type Edit = ts.TextRange & { newText: string };
	type File = { sourceFilePath: string; targetFilePath: string; contents: string };
	type StackElement = { filepath: string; importTrajectory: string[] };

	const seen = new Map<string, File>(); // indexed by sourceFilePath
	const stack: StackElement[] = [...filepaths.map(p => ({ filepath: join(VS_ROOT, p), importTrajectory: [] }))];

	while (stack.length > 0) {
		const stackElement = stack.pop()!;
		const importTrajectory = stackElement.importTrajectory.slice(0);
		importTrajectory.push(stackElement.filepath);

		let filepath = stackElement.filepath;
		if (seen.has(filepath)) {
			continue;
		}

		const edits: Edit[] = [];
		let source: string = '';
		try {
			source = String(await fs.promises.readFile(filepath));
		} catch (e) {
			try {
				// .ts doesn't exist, try, .d.ts
				filepath = filepath.replace(/\.ts$/, '.d.ts');
				source = String(await fs.promises.readFile(filepath));
			} catch (e) {
				console.error(`❌ Error reading file ${filepath}. Trajectory:\n${stackElement.importTrajectory.reverse().map(el => `- ${el}`).join('\n')}:`);
				throw e;
			}
		}

		const destinationFilePath = determineTargetPath(filepath);
		const info = ts.preProcessFile(source, true, true);
		for (const importedFile of info.importedFiles) {

			let absolutePath: string | undefined;
			if (importedFile.fileName.startsWith('.')) {
				absolutePath = join(filepath, '..', importedFile.fileName.replace(/\.js$/, '.ts'));
			} else if (importedFile.fileName.includes('/')) {
				absolutePath = join(VS_ROOT, importedFile.fileName.replace(/\.js$/, '.ts'));
			}

			if (absolutePath) {
				stack.push({ filepath: absolutePath, importTrajectory });

				edits.push({
					...importedFile,
					newText: createRelativeImportPath(destinationFilePath, determineTargetPath(absolutePath)),
				});
			}

			// console.log(`${filepath} <<<imports<<< ${absolutePath}`);
		}

		let newSource = source;

		for (const edit of edits.sort((a, b) => b.pos - a.pos)) {
			newSource = newSource.slice(0, edit.pos + 1) + edit.newText + newSource.slice(edit.end + 1);
		}

		newSource = '//!!! DO NOT modify, this file was COPIED from \'microsoft/vscode\'\n\n' + newSource;

		seen.set(filepath, {
			sourceFilePath: filepath,
			targetFilePath: destinationFilePath,
			contents: newSource
		});
	}

	for (const [_, file] of seen) {

		const targetFilepath = file.targetFilePath;

		await fs.promises.mkdir(join(targetFilepath, '..'), { recursive: true });
		await fs.promises.writeFile(targetFilepath, file.contents);
	}

	console.log(`✅ done, copied ${filepaths.length} files and ${seen.size - filepaths.length} dependencies`);
}

(async function () {
	try {
		await doIt([
			// ********************************************
			// add modules from `base` here and
			// run `npx tsx script/setup/copySources.ts`
			// ********************************************
			'vs/base/common/arrays.ts',
			'vs/base/common/async.ts',
			'vs/base/common/cache.ts',
			'vs/base/common/cancellation.ts',
			'vs/base/common/charCode.ts',
			'vs/base/common/date.ts',
			'vs/base/common/errors.ts',
			'vs/base/common/event.ts',
			'vs/base/common/functional.ts',
			'vs/base/common/glob.ts',
			'vs/base/common/htmlContent.ts',
			'vs/base/common/iconLabels.ts',
			'vs/base/common/iterator.ts',
			'vs/base/common/lifecycle.ts',
			'vs/base/common/linkedList.ts',
			'vs/base/common/map.ts',
			'vs/base/common/numbers.ts',
			'vs/base/common/objects.ts',
			'vs/base/common/resources.ts',
			'vs/base/common/strings.ts',
			'vs/base/common/ternarySearchTree.ts',
			'vs/base/common/themables.ts',
			'vs/base/common/uri.ts',
			'vs/base/common/uuid.ts',
			'vs/base/common/yaml.ts',
			'vs/editor/common/core/ranges/offsetRange.ts',
			'vs/editor/common/core/wordHelper.ts',
			'vs/editor/common/model/prefixSumComputer.ts',

			'vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.ts',

			'vs/base/node/ports.ts',

			'vs/platform/instantiation/common/instantiationService.ts',
			'vs/editor/common/core/edits/lineEdit.ts',
			'vs/editor/common/core/edits/lengthEdit.ts',
			'vs/editor/common/core/edits/arrayEdit.ts',
			'vs/editor/common/core/text/positionToOffset.ts',
			'vs/editor/common/model/mirrorTextModel.ts',

			'vs/workbench/api/common/extHostTypes/diagnostic.ts',
			'vs/workbench/api/common/extHostTypes/location.ts',
			'vs/workbench/api/common/extHostTypes/markdownString.ts',
			'vs/workbench/api/common/extHostTypes/notebooks.ts',
			'vs/workbench/api/common/extHostTypes/position.ts',
			'vs/workbench/api/common/extHostTypes/range.ts',
			'vs/workbench/api/common/extHostTypes/selection.ts',
			'vs/workbench/api/common/extHostTypes/snippetString.ts',
			'vs/workbench/api/common/extHostTypes/snippetTextEdit.ts',
			'vs/workbench/api/common/extHostTypes/textEdit.ts',
			'vs/workbench/api/common/extHostTypes/symbolInformation.ts',
			'vs/workbench/api/common/extHostDocumentData.ts',
			'vs/workbench/contrib/chat/common/promptSyntax/promptFileParser.ts',

			'vs/base/common/sseParser.ts',

			// SPECIAL IMPLICIT DEPENDENCIES
			'typings/vscode-globals-nls.d.ts',
			'typings/vscode-globals-product.d.ts',
			'typings/base-common.d.ts',
			'typings/crypto.d.ts',
		]);
	} catch (error) {
		console.error(error);
	}
})();
