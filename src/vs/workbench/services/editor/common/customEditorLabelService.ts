/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { ParsedPattern, parse as parseGlob } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { isAbsolute, parse as parsePath, ParsedPath, dirname } from 'vs/base/common/path';
import { dirname as resourceDirname, relativePath as getRelativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { MRUCache } from 'vs/base/common/map';

interface ICustomEditorLabelObject {
	readonly [key: string]: string;
}

interface ICustomEditorLabelPattern {
	readonly pattern: string;
	readonly template: string;

	readonly isAbsolutePath: boolean;
	readonly parsedPattern: ParsedPattern;
}

export class CustomEditorLabelService extends Disposable implements ICustomEditorLabelService {

	readonly _serviceBrand: undefined;

	static readonly SETTING_ID_PATTERNS = 'workbench.editor.customLabels.patterns';
	static readonly SETTING_ID_ENABLED = 'workbench.editor.customLabels.enabled';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private patterns: ICustomEditorLabelPattern[] = [];
	private enabled = true;

	private cache = new MRUCache<string, string | null>(1000);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this.storeEnablementState();
		this.storeCustomPatterns();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			// Cache the enabled state
			if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED)) {
				const oldEnablement = this.enabled;
				this.storeEnablementState();
				if (oldEnablement !== this.enabled && this.patterns.length > 0) {
					this._onDidChange.fire();
				}
			}

			// Cache the patterns
			else if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS)) {
				this.cache.clear();
				this.storeCustomPatterns();
				this._onDidChange.fire();
			}
		}));
	}

	private storeEnablementState(): void {
		this.enabled = this.configurationService.getValue<boolean>(CustomEditorLabelService.SETTING_ID_ENABLED);
	}

	private _templateRegexValidation: RegExp = /[a-zA-Z0-9]/;
	private storeCustomPatterns(): void {
		this.patterns = [];
		const customLabelPatterns = this.configurationService.getValue<ICustomEditorLabelObject>(CustomEditorLabelService.SETTING_ID_PATTERNS);
		for (const pattern in customLabelPatterns) {
			const template = customLabelPatterns[pattern];

			if (!this._templateRegexValidation.test(template)) {
				continue;
			}

			const isAbsolutePath = isAbsolute(pattern);
			const parsedPattern = parseGlob(pattern);

			this.patterns.push({ pattern, template, isAbsolutePath, parsedPattern });
		}

		this.patterns.sort((a, b) => this.patternWeight(b.pattern) - this.patternWeight(a.pattern));
	}

	private patternWeight(pattern: string): number {
		let weight = 0;
		for (const fragment of pattern.split('/')) {
			if (fragment === '**') {
				weight += 1;
			} else if (fragment === '*') {
				weight += 10;
			} else if (fragment.includes('*') || fragment.includes('?')) {
				weight += 50;
			} else if (fragment !== '') {
				weight += 100;
			}
		}

		return weight;
	}

	getName(resource: URI): string | undefined {
		if (!this.enabled || this.patterns.length === 0) {
			return undefined;
		}

		const key = resource.toString();
		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return cached ?? undefined;
		}

		const result = this.applyPatterns(resource);
		this.cache.set(key, result ?? null);

		return result;
	}

	private applyPatterns(resource: URI): string | undefined {
		const root = this.workspaceContextService.getWorkspaceFolder(resource);
		let relativePath: string | undefined;

		for (const pattern of this.patterns) {
			let relevantPath: string;
			if (root && !pattern.isAbsolutePath) {
				if (!relativePath) {
					relativePath = getRelativePath(resourceDirname(root.uri), resource) ?? resource.path;
				}
				relevantPath = relativePath;
			} else {
				relevantPath = resource.path;
			}

			if (pattern.parsedPattern(relevantPath)) {
				return this.applyTemplate(pattern.template, resource, relevantPath);
			}
		}

		return undefined;
	}

	private readonly _parsedTemplateExpression = /\$\{(dirname|filename|extname|extname\((?<extnameN>[-+]?\d+)\)|dirname\((?<dirnameN>[-+]?\d+)\))\}/g;
	private readonly _filenameCaptureExpression = /(?<filename>^\.*[^.]*)/;
	private applyTemplate(template: string, resource: URI, relevantPath: string): string {
		let parsedPath: undefined | ParsedPath;
		return template.replace(this._parsedTemplateExpression, (match: string, variable: string, ...args: any[]) => {
			parsedPath = parsedPath ?? parsePath(resource.path);
			// named group matches
			const { dirnameN = '0', extnameN = '0' }: { dirnameN?: string; extnameN?: string } = args.pop();

			if (variable === 'filename') {
				const { filename } = this._filenameCaptureExpression.exec(parsedPath.base)?.groups ?? {};
				if (filename) {
					return filename;
				}
			} else if (variable === 'extname') {
				const extension = this.getExtnames(parsedPath.base);
				if (extension) {
					return extension;
				}
			} else if (variable.startsWith('extname')) {
				const n = parseInt(extnameN);
				const nthExtname = this.getNthExtname(parsedPath.base, n);
				if (nthExtname) {
					return nthExtname;
				}
			} else if (variable.startsWith('dirname')) {
				const n = parseInt(dirnameN);
				const nthDir = this.getNthDirname(dirname(relevantPath), n);
				if (nthDir) {
					return nthDir;
				}
			}

			return match;
		});
	}

	private removeLeadingDot(path: string): string {
		let withoutLeadingDot = path;
		while (withoutLeadingDot.startsWith('.')) {
			withoutLeadingDot = withoutLeadingDot.slice(1);
		}
		return withoutLeadingDot;
	}

	private getNthDirname(path: string, n: number): string | undefined {
		// grand-parent/parent/filename.ext1.ext2 -> [grand-parent, parent]
		path = path.startsWith('/') ? path.slice(1) : path;
		const pathFragments = path.split('/');

		return this.getNthFragment(pathFragments, n);
	}

	private getExtnames(fullFileName: string): string {
		return this.removeLeadingDot(fullFileName).split('.').slice(1).join('.');
	}

	private getNthExtname(fullFileName: string, n: number): string | undefined {
		// file.ext1.ext2.ext3 -> [file, ext1, ext2, ext3]
		const extensionNameFragments = this.removeLeadingDot(fullFileName).split('.');
		extensionNameFragments.shift(); // remove the first element which is the file name

		return this.getNthFragment(extensionNameFragments, n);
	}

	private getNthFragment(fragments: string[], n: number): string | undefined {
		const length = fragments.length;

		let nth;
		if (n < 0) {
			nth = Math.abs(n) - 1;
		} else {
			nth = length - n - 1;
		}

		const nthFragment = fragments[nth];
		if (nthFragment === undefined || nthFragment === '') {
			return undefined;
		}
		return nthFragment;
	}
}

export const ICustomEditorLabelService = createDecorator<ICustomEditorLabelService>('ICustomEditorLabelService');

export interface ICustomEditorLabelService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getName(resource: URI): string | undefined;
}

registerSingleton(ICustomEditorLabelService, CustomEditorLabelService, InstantiationType.Delayed);
