/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { match } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename, dirname, extname, isAbsolutePath, relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

interface IFilenameAttributes {
	// grand-parent/parent/filename.ext1.ext2 -> parent
	dirname: string;

	// grand-parent/parent/filename.ext1.ext2 -> [grand-parent, parent]
	pathFragments: string[];

	// grand-parent/parent/filename.ext1.ext2 -> filename.ext1
	filename: string;

	// grand-parent/parent/filename.ext1.ext2 -> ext2
	extname: string;
}

interface IEditorCustomLabelObject {
	[key: string]: string;
}

interface ICustomEditorLabelPattern {
	pattern: string;
	template: string;
}

export class CustomEditorLabelService extends Disposable implements ICustomEditorLabelService {

	readonly _serviceBrand: undefined;

	static readonly SETTING_ID_PATTERNS = 'workbench.editor.label.patterns';
	static readonly SETTING_ID_ENABLED = 'workbench.editor.label.enabled';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private patterns: ICustomEditorLabelPattern[] = [];
	private enabled = true;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this.storeEnablementState();
		this.storeCustomPatterns();

		this.registerListernes();
	}

	private registerListernes(): void {
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
				this.storeCustomPatterns();
				this._onDidChange.fire();
			}
		}));
	}

	private storeEnablementState(): void {
		this.enabled = this.configurationService.getValue<boolean>(CustomEditorLabelService.SETTING_ID_ENABLED);
	}

	private storeCustomPatterns(): void {
		this.patterns = [];
		const customLabelPatterns = this.configurationService.getValue<IEditorCustomLabelObject>(CustomEditorLabelService.SETTING_ID_PATTERNS);
		for (const pattern in customLabelPatterns) {
			const template = customLabelPatterns[pattern];
			this.patterns.push({ pattern, template });
		}

		this.patterns.sort((a, b) => this.patternWeight(b.pattern) - this.patternWeight(a.pattern));
	}

	private patternWeight(pattern: string): number {
		pattern = pattern.replace('\\\\', '/');

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
		if (!this.enabled) {
			return undefined;
		}
		return this.applyPatterns(resource);
	}

	private applyPatterns(resource: URI): string | undefined {
		const root = this.workspaceContextService.getWorkspaceFolder(resource);
		for (const { pattern, template } of this.patterns) {
			if (this.matchPattern(root, resource, pattern)) {
				const attrs = this.getFileAttributes(resource);
				return this.applyTempate(template, attrs);
			}
		}
		return undefined;
	}

	private matchPattern(root: IWorkspaceFolder | null, resource: URI, pattern: string): boolean {
		const patternURI = URI.from({ scheme: 'glob', path: pattern }); // Used to figure out if the pattern is absolute
		const relevantPath = !root || isAbsolutePath(patternURI) ? resource.fsPath : relativePath(root.uri, resource) ?? resource.fsPath;

		return match(pattern, relevantPath);
	}

	private getFileAttributes(resource: URI): IFilenameAttributes {
		// grand-parent/parent/filename.ext1.ext2 -> parent
		const directoryURI = dirname(resource);
		const directoryName = basename(directoryURI);

		// grand-parent/parent/filename.ext1.ext2 -> [grand-parent, parent]
		const pathFragments = directoryURI.path.split('/');

		// grand-parent/parent/filename.ext1.ext2 -> filename.ext1
		const base = basename(resource);
		const baseSplit = base.split('.');
		const filename = baseSplit.length > 1 ? baseSplit.slice(0, -1).join('.') : baseSplit[0];

		// grand-parent/parent/filename.ext1.ext2 -> ext2
		const ext = extname(resource).slice(1);

		return { dirname: directoryName, filename, extname: ext, pathFragments };
	}

	private applyTempate(template: string, attrs: IFilenameAttributes): string {
		return template.replace(/\$\{dirname\}/g, attrs.dirname)
			.replace(/\$\{filename\}/g, attrs.filename)
			.replace(/\$\{extname\}/g, attrs.extname)
			.replace(/\$\{dirname\((\d+)\)\}/g, (_, n) => {
				const length = attrs.pathFragments.length;
				const nth = length - 1 - parseInt(n);
				if (nth < 0) {
					return '${dirname(' + n + ')}';
				}
				const nthDir = attrs.pathFragments[nth];
				if (nthDir === undefined || nthDir === '') {
					return '${dirname(' + n + ')}';
				}
				return nthDir;
			});
	}
}

export const ICustomEditorLabelService = createDecorator<ICustomEditorLabelService>('ICustomEditorLabelService');

export interface ICustomEditorLabelService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getName(resource: URI): string | undefined;
}

registerSingleton(ICustomEditorLabelService, CustomEditorLabelService, InstantiationType.Delayed);
