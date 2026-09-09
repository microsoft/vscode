/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IAutoRevealPairedFileConfiguration } from '../common/files.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IExplorerService } from './files.js';
import { URI } from '../../../../base/common/uri.js';
import * as resources from '../../../../base/common/resources.js';

interface ICompiledAutoRevealPattern {
	sourceRegex: RegExp;
	testRegex: RegExp;
	sourceTemplate: string;
	testTemplate: string;
	isValid: boolean;
}

export class AutoRevealPairedFileContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.autoRevealPairedFile';

	private compiledPatterns: ICompiledAutoRevealPattern[] = [];

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IExplorerService private readonly explorerService: IExplorerService,
	) {
		super();

		this.compilePatterns();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.autoRevealPairedFile')) {
				this.compilePatterns();
			}
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
	}

	private compilePatterns(): void {
		this.compiledPatterns = [];

		const config = this.configurationService.getValue<IAutoRevealPairedFileConfiguration>('workbench.autoRevealPairedFile');
		if (!config?.patterns?.length) {
			return;
		}

		for (const pattern of config.patterns) {
			if (!pattern?.source || !pattern?.test) {
				continue;
			}

			const sourceArtifacts = this.parsePattern(pattern.source);
			const testArtifacts = this.parsePattern(pattern.test);

			if (sourceArtifacts && testArtifacts) {
				this.compiledPatterns.push({
					sourceRegex: sourceArtifacts.regex,
					testRegex: testArtifacts.regex,
					sourceTemplate: sourceArtifacts.template,
					testTemplate: testArtifacts.template,
					isValid: true
				});
			} else {
				this.compiledPatterns.push({
					sourceRegex: /$^/,
					testRegex: /$^/,
					sourceTemplate: pattern.source,
					testTemplate: pattern.test,
					isValid: false
				});
			}
		}
	}

	private parsePattern(value: string): { regex: RegExp; template: string } | undefined {
		const hasCapturePlaceholders = /\$[0-9]+/.test(value);

		if (hasCapturePlaceholders) {
			const regex = this.buildRegexFromTemplate(value);
			if (!regex) {
				return undefined;
			}

			return { regex, template: value };
		}

		const regex = this.safeCreateRegex(value);
		if (!regex) {
			return undefined;
		}

		const template = this.createTemplateFromRegexSource(value);
		if (!template) {
			return undefined;
		}

		return { regex, template };
	}

	private safeCreateRegex(value: string): RegExp | undefined {
		try {
			return new RegExp(value);
		} catch {
			return undefined;
		}
	}

	private buildRegexFromTemplate(template: string): RegExp | undefined {
		const literalDollarPlaceholder = '\u0000';
		let patternSource = template.replace(/\$\$/g, literalDollarPlaceholder);

		patternSource = patternSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		patternSource = patternSource.replace(new RegExp(literalDollarPlaceholder, 'g'), '\\$');
		patternSource = patternSource.replace(/\\\$([0-9]+)/g, '(.+?)');

		try {
			return new RegExp(`^${patternSource}$`);
		} catch {
			return undefined;
		}
	}

	private createTemplateFromRegexSource(source: string): string | undefined {
		let result = '';
		let groupIndex = 0;

		for (let i = 0; i < source.length;) {
			const char = source[i];

			if (char === '\\') {
				if (i + 1 < source.length) {
					result += source[i + 1];
					i += 2;
				} else {
					i++;
				}
				continue;
			}

			if (char === '(') {
				if (source.startsWith('(?:', i) ||
					source.startsWith('(?=', i) ||
					source.startsWith('(?!', i) ||
					source.startsWith('(?<=', i) ||
					source.startsWith('(?<!', i)) {
					return undefined; // Unsupported constructs for template conversion.
				}

				groupIndex++;
				const closingIndex = this.findClosingParenIndex(source, i + 1);
				if (closingIndex === -1) {
					return undefined;
				}

				result += `$${groupIndex}`;
				i = closingIndex + 1;
				continue;
			}

			if (char === '^' || char === '$') {
				i++;
				continue;
			}

			result += char;
			i++;
		}

		return result;
	}

	private findClosingParenIndex(value: string, startIndex: number): number {
		let depth = 1;

		for (let i = startIndex; i < value.length; i++) {
			const char = value[i];

			if (char === '\\') {
				i++;
				continue;
			}

			if (char === '(') {
				depth++;
				continue;
			}

			if (char === ')') {
				depth--;
				if (depth === 0) {
					return i;
				}
			}
		}

		return -1;
	}

	private computePairedPath(relativePath: string): string | undefined {
		for (const pattern of this.compiledPatterns) {
			if (!pattern.isValid) {
				continue;
			}

			pattern.sourceRegex.lastIndex = 0;
			const sourceMatch = pattern.sourceRegex.exec(relativePath);
			if (sourceMatch) {
				return this.substituteCaptures(pattern.testTemplate, sourceMatch);
			}

			pattern.testRegex.lastIndex = 0;
			const testMatch = pattern.testRegex.exec(relativePath);
			if (testMatch) {
				return this.substituteCaptures(pattern.sourceTemplate, testMatch);
			}
		}

		return undefined;
	}

	private substituteCaptures(template: string, matches: RegExpExecArray): string {
		return template.replace(/\$([0-9]+)/g, (_placeholder, index) => matches[Number(index)] ?? '');
	}

	private computePairedUri(resource: URI): URI | undefined {
		const workspaceFolder = this.workspaceContextService.getWorkspaceFolder(resource);
		if (!workspaceFolder) {
			return undefined;
		}

		const relativePath = resources.relativePath(workspaceFolder.uri, resource);
		if (!relativePath) {
			return undefined;
		}

		const pairedPath = this.computePairedPath(relativePath);
		if (!pairedPath) {
			return undefined;
		}

		return resources.joinPath(workspaceFolder.uri, pairedPath);
	}

	private onActiveEditorChange(): void {
		const config = this.configurationService.getValue<IAutoRevealPairedFileConfiguration>('workbench.autoRevealPairedFile');
		if (!config?.enabled) {
			return;
		}

		if (!this.compiledPatterns.length) {
			return;
		}

		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return;
		}

		const activeEditor = this.editorService.activeEditor;
		if (!activeEditor) {
			return;
		}

		const resource = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (!resource) {
			return;
		}

		const pairedResource = this.computePairedUri(resource);
		if (!pairedResource) {
			return;
		}

		// Resolve existence asynchronously before revealing the paired file.
		void this.checkAndRevealPairedFile(pairedResource);
	}

	private async checkAndRevealPairedFile(pairedResource: URI): Promise<void> {
		const exists = await this.fileService.exists(pairedResource);
		if (!exists) {
			return;
		}

		// Use the explorer service to reveal the paired file without stealing focus.
		await this.explorerService.select(pairedResource, 'force');
	}
}

