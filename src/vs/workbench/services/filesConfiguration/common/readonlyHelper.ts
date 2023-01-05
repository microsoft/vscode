/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { match as matchGlobPattern } from 'vs/base/common/glob';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileSystemProviderCapabilities, IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';

export class ReadonlyHelper extends Disposable {
	constructor(
		readonly resource: URI,
		readonly onDidChangeReadonly: Emitter<void>,
		readonly fileService: IFileService,
		readonly configurationService: IConfigurationService,
	) {
		super();
		this.setGlobReadonly();    // and then track with onDidChangeConfiguration()
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
	}

	private lastResolvedFileStat: IFileStatWithMetadata | undefined;

	private anyGlobMatches(key: string, path: string): boolean {
		const globs: { [glob: string]: boolean } = this.configurationService.getValue<{ [glob: string]: boolean }>(key);
		return !!(globs && Object.keys(globs).find(glob => globs[glob] && matchGlobPattern(glob, path)));
	}

	private setGlobReadonly() {
		this.globReadonly = this.anyGlobMatches('files.readonlyInclude', this.resource.path)
			&& !this.anyGlobMatches('files.readonlyExclude', this.resource.path);
	}

	private onDidChangeConfiguration(event: IConfigurationChangeEvent) {
		if (event.affectsConfiguration('files.readonlyInclude') ||
			event.affectsConfiguration('files.readonlyExclude')) {
			this.setGlobReadonly();
		} else if (event.affectsConfiguration('files.readonlyPath')) {
			const readonlyPath = this.configurationService.getValue<{ [glob: string]: boolean | null | 'toggle' }>('files.readonlyPath');
			if (readonlyPath !== undefined) {
				const pathValue = readonlyPath[this.resource.path];
				if (pathValue !== undefined) {
					if (pathValue === 'toggle') {
						// must modify settings, so subsequent 'toggle' will be seen as a change:
						this.pathReadonly = readonlyPath[this.resource.path] = !this.oldReadonly;
						this.configurationService.updateValue('files.readonlyPath', readonlyPath, ConfigurationTarget.USER);
					} else {
						this.pathReadonly = pathValue;
					}
				}
			}
		}
	}

	// tri-state: true | false overrides globReadonly; null does not.
	private pathReadonly: boolean | null = null;

	// stable/semantic 'readonly' [nonEditable]; typically based on filetype or directory.
	private globReadonly: boolean = false;

	// latest value derived from files.readonlyInclude/Exclude for this resource.path
	private oldReadonly = false; // fileEditorInput.test.ts counts changes from 'false' not 'undefined'

	private checkDidChangeReadonly(newReadonly: boolean): boolean {
		if (this.oldReadonly !== newReadonly) {
			this.oldReadonly = newReadonly;    // must set before fire(); reentrant.
			this.onDidChangeReadonly.fire();
		}
		return newReadonly;
	}

	/** return true if associated resource is treated as nonEditable. */
	isReadonly(): boolean {
		return this.checkDidChangeReadonly(
			this.pathReadonly !== null ? this.pathReadonly :
				this.globReadonly ||
				this.lastResolvedFileStat?.readonly ||
				this.fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly));
	}
}
