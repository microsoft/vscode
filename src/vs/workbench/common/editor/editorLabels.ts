/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { match } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename, dirname, extname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface IFilenameAttributes {
	// grand-parent/parent/filename.ext1.ext2 -> parent
	dirname: string;

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

export class CustomEditorLabel extends Disposable {

	static readonly SETTING_ID_PATTERNS = 'workbench.editor.label.patterns';
	static readonly SETTING_ID_ENABLED = 'workbench.editor.label.enabled';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private patterns: ICustomEditorLabelPattern[] = [];
	private enabled = true;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.storeEnablementState();
		this.storeCustomPatterns();

		this.registerListernes();
	}

	private registerListernes(): void {
		// Cache the enabled state
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CustomEditorLabel.SETTING_ID_ENABLED)) {
				this.storeEnablementState();
				if (this.patterns.length > 0) {
					this._onDidChange.fire();
				}
			}
		}));

		// Cache the patterns
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CustomEditorLabel.SETTING_ID_PATTERNS)) {
				this.storeCustomPatterns();
				this._onDidChange.fire();
			}
		}));
	}

	private storeEnablementState(): void {
		this.enabled = this.configurationService.getValue<boolean>(CustomEditorLabel.SETTING_ID_ENABLED);
	}

	private storeCustomPatterns(): void {
		this.patterns = [];
		const customLabelPatterns = this.configurationService.getValue<IEditorCustomLabelObject>(CustomEditorLabel.SETTING_ID_PATTERNS);
		for (const pattern in customLabelPatterns) {
			const template = customLabelPatterns[pattern];
			this.patterns.push({ pattern, template });
		}
	}

	getName(resource: URI): string | undefined {
		if (!this.enabled) {
			return undefined;
		}
		return this.applyPatterns(resource);
	}

	private applyPatterns(resource: URI): string | undefined {
		for (const { pattern, template } of this.patterns) {
			const attrs = this.matchPattern(resource, pattern);
			if (attrs) {
				return this.applyTempate(template, attrs);
			}
		}
		return undefined;
	}

	private matchPattern(resource: URI, pattern: string): IFilenameAttributes | undefined {
		const matches = match(pattern, resource.fsPath);
		if (matches) {
			// grand-parent/parent/filename.ext1.ext2 -> parent
			const directoryName = basename(dirname(resource));

			// grand-parent/parent/filename.ext1.ext2 -> filename.ext1
			const base = basename(resource);
			const baseSplit = base.split('.');
			const filename = baseSplit.length > 1 ? baseSplit.slice(0, -1).join('.') : baseSplit[0];

			// grand-parent/parent/filename.ext1.ext2 -> ext2
			const ext = extname(resource).slice(1);

			return { dirname: directoryName, filename, extname: ext };
		}
		return undefined;
	}

	private applyTempate(template: string, attrs: IFilenameAttributes): string {
		return template.replace(/\$\{dirname\}/g, attrs.dirname)
			.replace(/\$\{filename\}/g, attrs.filename)
			.replace(/\$\{extname\}/g, attrs.extname);
	}
}
