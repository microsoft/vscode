/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import * as encoding from 'vs/base/node/encoding';
import { URI as uri } from 'vs/base/common/uri';
import { IResolveContentOptions, isParent, IResourceEncodings } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import { extname } from 'path';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';

export interface IEncodingOverride {
	parent?: uri;
	extension?: string;
	encoding: string;
}

// TODO@Ben debt - encodings should move one layer up from the file service into the text file
// service and then ideally be passed in as option to the file service
// the file service should talk about string | Buffer for reading and writing and only convert
// to strings if a encoding is provided
export class ResourceEncodings extends Disposable implements IResourceEncodings {
	private encodingOverride: IEncodingOverride[];

	constructor(
		private textResourceConfigurationService: ITextResourceConfigurationService,
		private environmentService: IEnvironmentService,
		private contextService: IWorkspaceContextService,
		encodingOverride?: IEncodingOverride[]
	) {
		super();

		this.encodingOverride = encodingOverride || this.getEncodingOverrides();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Workspace Folder Change
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => {
			this.encodingOverride = this.getEncodingOverrides();
		}));
	}

	getReadEncoding(resource: uri, options: IResolveContentOptions, detected: encoding.IDetectedEncodingResult): string {
		let preferredEncoding: string | undefined;

		// Encoding passed in as option
		if (options && options.encoding) {
			if (detected.encoding === encoding.UTF8 && options.encoding === encoding.UTF8) {
				preferredEncoding = encoding.UTF8_with_bom; // indicate the file has BOM if we are to resolve with UTF 8
			} else {
				preferredEncoding = options.encoding; // give passed in encoding highest priority
			}
		}

		// Encoding detected
		else if (detected.encoding) {
			if (detected.encoding === encoding.UTF8) {
				preferredEncoding = encoding.UTF8_with_bom; // if we detected UTF-8, it can only be because of a BOM
			} else {
				preferredEncoding = detected.encoding;
			}
		}

		// Encoding configured
		else if (this.textResourceConfigurationService.getValue(resource, 'files.encoding') === encoding.UTF8_with_bom) {
			preferredEncoding = encoding.UTF8; // if we did not detect UTF 8 BOM before, this can only be UTF 8 then
		}

		return this.getEncodingForResource(resource, preferredEncoding);
	}

	getWriteEncoding(resource: uri, preferredEncoding?: string): string {
		return this.getEncodingForResource(resource, preferredEncoding);
	}

	private getEncodingForResource(resource: uri, preferredEncoding?: string): string {
		let fileEncoding: string;

		const override = this.getEncodingOverride(resource);
		if (override) {
			fileEncoding = override; // encoding override always wins
		} else if (preferredEncoding) {
			fileEncoding = preferredEncoding; // preferred encoding comes second
		} else {
			fileEncoding = this.textResourceConfigurationService.getValue(resource, 'files.encoding'); // and last we check for settings
		}

		if (!fileEncoding || !encoding.encodingExists(fileEncoding)) {
			fileEncoding = encoding.UTF8; // the default is UTF 8
		}

		return fileEncoding;
	}

	private getEncodingOverrides(): IEncodingOverride[] {
		const encodingOverride: IEncodingOverride[] = [];

		// Global settings
		encodingOverride.push({ parent: uri.file(this.environmentService.appSettingsHome), encoding: encoding.UTF8 });

		// Workspace files
		encodingOverride.push({ extension: WORKSPACE_EXTENSION, encoding: encoding.UTF8 });

		// Folder Settings
		this.contextService.getWorkspace().folders.forEach(folder => {
			encodingOverride.push({ parent: joinPath(folder.uri, '.vscode'), encoding: encoding.UTF8 });
		});

		return encodingOverride;
	}

	private getEncodingOverride(resource: uri): string | null {
		if (resource && this.encodingOverride && this.encodingOverride.length) {
			for (const override of this.encodingOverride) {

				// check if the resource is child of encoding override path
				if (override.parent && isParent(resource.fsPath, override.parent.fsPath, !isLinux /* ignorecase */)) {
					return override.encoding;
				}

				// check if the resource extension is equal to encoding override
				if (override.extension && extname(resource.fsPath) === `.${override.extension}`) {
					return override.encoding;
				}
			}
		}

		return null;
	}
}
