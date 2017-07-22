/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMirrorModel, IWorkerContext } from 'vs/editor/common/services/editorSimpleWorker';
import { ILink } from 'vs/editor/common/modes';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import { Range } from 'vs/editor/common/core/range';

export interface ICreateData {
	workspaceFolders: string[];
}

export interface IResourceCreator {
	toResource: (folderRelativePath: string) => URI;
}

export class OutputLinkComputer {
	private ctx: IWorkerContext;
	private patterns: Map<string /* folder fsPath */, RegExp[]>;

	constructor(ctx: IWorkerContext, createData: ICreateData) {
		this.ctx = ctx;
		this.patterns = new Map<string, RegExp[]>();

		this.computePatterns(createData);
	}

	private computePatterns(createData: ICreateData): void {

		// Produce patterns for each workspace root we are configured with
		// This means that we will be able to detect links for paths that
		// contain any of the workspace roots as segments.
		const workspaceFolders = createData.workspaceFolders.map(r => URI.parse(r));
		workspaceFolders.forEach(workspaceFolder => {
			const patterns = OutputLinkComputer.createPatterns(workspaceFolder);
			this.patterns.set(workspaceFolder.fsPath, patterns);
		});
	}

	private getModel(uri: string): IMirrorModel {
		const models = this.ctx.getMirrorModels();
		for (let i = 0; i < models.length; i++) {
			const model = models[i];
			if (model.uri.toString() === uri) {
				return model;
			}
		}

		return null;
	}

	public computeLinks(uri: string): TPromise<ILink[]> {
		const model = this.getModel(uri);
		if (!model) {
			return void 0;
		}

		const links: ILink[] = [];
		const lines = model.getValue().split(/\r\n|\r|\n/);

		// For each workspace root patterns
		this.patterns.forEach((folderPatterns, folderPath) => {
			const resourceCreator: IResourceCreator = {
				toResource: (folderRelativePath: string): URI => {
					if (typeof folderRelativePath === 'string') {
						return URI.file(paths.join(folderPath, folderRelativePath));
					}

					return null;
				}
			};

			for (let i = 0, len = lines.length; i < len; i++) {
				links.push(...OutputLinkComputer.detectLinks(lines[i], i + 1, folderPatterns, resourceCreator));
			}
		});

		return TPromise.as(links);
	}

	public static createPatterns(workspaceFolder: URI): RegExp[] {
		const patterns: RegExp[] = [];

		const workspaceFolderVariants = arrays.distinct([
			paths.normalize(workspaceFolder.fsPath, true),
			paths.normalize(workspaceFolder.fsPath, false)
		]);

		workspaceFolderVariants.forEach(workspaceFolderVariant => {

			// Example: /workspaces/express/server.js on line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + '(\\S*) on line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: /workspaces/express/server.js:line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + '(\\S*):line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: /workspaces/mankala/Features.ts(45): error
			// Example: /workspaces/mankala/Features.ts (45): error
			// Example: /workspaces/mankala/Features.ts(45,18): error
			// Example: /workspaces/mankala/Features.ts (45,18): error
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + '([^\\s\\(\\)]*)(\\s?\\((\\d+)(,(\\d+))?)\\)', 'gi'));

			// Example: at /workspaces/mankala/Game.ts
			// Example: at /workspaces/mankala/Game.ts:336
			// Example: at /workspaces/mankala/Game.ts:336:9
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceFolderVariant) + '([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?', 'gi'));
		});

		return patterns;
	}

	/**
	 * Detect links. Made public static to allow for tests.
	 */
	public static detectLinks(line: string, lineIndex: number, patterns: RegExp[], resourceCreator: IResourceCreator): ILink[] {
		const links: ILink[] = [];

		patterns.forEach(pattern => {
			pattern.lastIndex = 0; // the holy grail of software development

			let match: RegExpExecArray;
			let offset = 0;
			while ((match = pattern.exec(line)) !== null) {

				// Convert the relative path information to a resource that we can use in links
				const folderRelativePath = strings.rtrim(match[1], '.').replace(/\\/g, '/'); // remove trailing "." that likely indicate end of sentence
				let resource: string;
				try {
					resource = resourceCreator.toResource(folderRelativePath).toString();
				} catch (error) {
					continue; // we might find an invalid URI and then we dont want to loose all other links
				}

				// Append line/col information to URI if matching
				if (match[3]) {
					const lineNumber = match[3];

					if (match[5]) {
						const columnNumber = match[5];
						resource = strings.format('{0}#{1},{2}', resource, lineNumber, columnNumber);
					} else {
						resource = strings.format('{0}#{1}', resource, lineNumber);
					}
				}

				const fullMatch = strings.rtrim(match[0], '.'); // remove trailing "." that likely indicate end of sentence

				const index = line.indexOf(fullMatch, offset);
				offset += index + fullMatch.length;

				const linkRange = {
					startColumn: index + 1,
					startLineNumber: lineIndex,
					endColumn: index + 1 + fullMatch.length,
					endLineNumber: lineIndex
				};

				if (links.some(link => Range.areIntersectingOrTouching(link.range, linkRange))) {
					return; // Do not detect duplicate links
				}

				links.push({
					range: linkRange,
					url: resource
				});
			}
		});

		return links;
	}
}

export function create(ctx: IWorkerContext, createData: ICreateData): OutputLinkComputer {
	return new OutputLinkComputer(ctx, createData);
}
