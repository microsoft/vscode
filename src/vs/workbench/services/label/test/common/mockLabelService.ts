/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename, normalize } from '../../../../../base/common/path.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFormatterChangeEvent, ILabelService, ResourceLabelFormatter, Verbosity } from '../../../../../platform/label/common/label.js';
import { IWorkspace, IWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';

export class MockLabelService implements ILabelService {
	_serviceBrand: undefined;
	private formatters: ResourceLabelFormatter[] = [];
	private readonly _onDidChangeFormatters = new Emitter<IFormatterChangeEvent>();
	readonly onDidChangeFormatters = this._onDidChangeFormatters.event;

	registerCachedFormatter(formatter: ResourceLabelFormatter): IDisposable {
		return this.registerFormatter(formatter);
	}
	getUriLabel(resource: URI, options?: { relative?: boolean | undefined; noPrefix?: boolean | undefined }): string {
		const formatter = this.findHomeFormatter(resource);
		if (formatter?.home) {
			const relativePath = resource.path.slice(formatter.home.length).replace(/^\//, '');
			return relativePath ? `${formatter.formatting.label}/${relativePath}` : formatter.formatting.label;
		}
		return normalize(resource.fsPath);
	}
	getUriBasenameLabel(resource: URI): string {
		return basename(resource.fsPath);
	}
	getWorkspaceLabel(workspace: URI | IWorkspaceIdentifier | IWorkspace, options?: { verbose: Verbosity }): string {
		return '';
	}
	getHostLabel(scheme: string, authority?: string): string {
		return '';
	}
	public getHostTooltip(): string | undefined {
		return '';
	}
	getSeparator(scheme: string, authority?: string): '/' | '\\' {
		return '/';
	}
	registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		this.formatters.push(formatter);
		this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
		return {
			dispose: () => {
				this.formatters = this.formatters.filter(candidate => candidate !== formatter);
				this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
			}
		};
	}

	getUriHome(resource: URI): URI | undefined {
		const formatter = this.findHomeFormatter(resource);
		return formatter?.home ? resource.with({ path: formatter.home, query: null, fragment: null }) : undefined;
	}

	private findHomeFormatter(resource: URI): ResourceLabelFormatter | undefined {
		let result: ResourceLabelFormatter | undefined;
		for (const formatter of this.formatters) {
			if (!formatter.home) {
				continue;
			}
			if (formatter.scheme !== resource.scheme || (formatter.authority && formatter.authority !== resource.authority)) {
				continue;
			}
			if (!isEqualOrParent(resource, resource.with({ path: formatter.home }))) {
				continue;
			}
			if (!result || formatter.home.length > (result.home?.length ?? 0)) {
				result = formatter;
			}
		}
		return result;
	}

}
