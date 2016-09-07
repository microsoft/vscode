/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import URI from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import paths = require('vs/base/common/paths');
import {ILink} from 'vs/editor/common/modes';
import {Range} from 'vs/editor/common/core/range';

export interface IResourceCreator {
	toResource: (workspaceRelativePath: string) => URI;
}

function equals(a:URI, b:URI): boolean {
	if (!a && !b) {
		return true;
	}
	if ((a && !b) || (!a && b)) {
		return false;
	}
	return a.toString() === b.toString();
}

/**
 * A base class of text editor worker that helps with detecting links in the text that point to files in the workspace.
 */
export class OutputWorker {

	private resourceService:IResourceService;

	private _cachedWorkspaceResource: URI;
	private _cachedPatterns: RegExp[];

	constructor(
		modeId: string,
		@IResourceService resourceService: IResourceService
	) {
		this.resourceService = resourceService;
		this._cachedWorkspaceResource = null;
		this._cachedPatterns = [];
	}

	private _getPatterns(workspaceResource: URI): RegExp[] {
		if (!equals(this._cachedWorkspaceResource, workspaceResource)) {
			// received new workspaceResource, recreate patterns
			console.log('recreating patterns');

			this._cachedWorkspaceResource = workspaceResource;
			this._cachedPatterns = OutputWorker.createPatterns(this._cachedWorkspaceResource);
		}
		return this._cachedPatterns;
	}

	public provideLinks(workspaceResource: URI, resource: URI): TPromise<ILink[]> {
		let patterns = this._getPatterns(workspaceResource);

		let links: ILink[] = [];
		let model = this.resourceService.get(resource);

		let resourceCreator: IResourceCreator = {
			toResource: (workspaceRelativePath: string): URI => {
				if (typeof workspaceRelativePath === 'string') {
					return URI.file(paths.join(workspaceResource.fsPath, workspaceRelativePath));
				}
				return null;
			}
		};

		for (let i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
			links.push(...OutputWorker.detectLinks(model.getLineContent(i), i, patterns, resourceCreator));
		}

		return TPromise.as(links);
	}

	public static createPatterns(workspaceResource: URI): RegExp[] {
		let patterns: RegExp[] = [];

		let workspaceRootVariants = arrays.distinct([
			paths.normalize(workspaceResource.fsPath, true),
			paths.normalize(workspaceResource.fsPath, false)
		]);

		workspaceRootVariants.forEach((workspaceRoot) => {

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js on line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '(\\S*) on line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js:line 8, column 13
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '(\\S*):line ((\\d+)(, column (\\d+))?)', 'gi'));

			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts(45): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts (45): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts(45,18): error
			// Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Features.ts (45,18): error
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '([^\\s\\(\\)]*)(\\s?\\((\\d+)(,(\\d+))?)\\)', 'gi'));

			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts
			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts:336
			// Example: at C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\mankala\Game.ts:336:9
			patterns.push(new RegExp(strings.escapeRegExpCharacters(workspaceRoot) + '([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?', 'gi'));
		});

		return patterns;
	}

	/**
	 * Detect links. Made public static to allow for tests.
	 */
	public static detectLinks(line: string, lineIndex: number, patterns: RegExp[], contextService: IResourceCreator): ILink[] {
		let links: ILink[] = [];

		patterns.forEach((pattern) => {
			pattern.lastIndex = 0; // the holy grail of software development

			let match: RegExpExecArray;
			let offset = 0;
			while ((match = pattern.exec(line)) !== null) {

				// Convert the relative path information to a resource that we can use in links
				let workspaceRelativePath = strings.rtrim(match[1], '.').replace(/\\/g, '/'); // remove trailing "." that likely indicate end of sentence
				let resource:string;
				try {
					resource = contextService.toResource(workspaceRelativePath).toString();
				} catch (error) {
					continue; // we might find an invalid URI and then we dont want to loose all other links
				}

				// Append line/col information to URI if matching
				if (match[3]) {
					let lineNumber = match[3];

					if (match[5]) {
						let columnNumber = match[5];
						resource = strings.format('{0}#{1},{2}', resource, lineNumber, columnNumber);
					} else {
						resource = strings.format('{0}#{1}', resource, lineNumber);
					}
				}

				let fullMatch = strings.rtrim(match[0], '.'); // remove trailing "." that likely indicate end of sentence

				let index = line.indexOf(fullMatch, offset);
				offset += index + fullMatch.length;

				var linkRange = {
					startColumn: index + 1,
					startLineNumber: lineIndex,
					endColumn: index + 1 + fullMatch.length,
					endLineNumber: lineIndex
				};

				if (links.some((link) => Range.areIntersectingOrTouching(link.range, linkRange))) {
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