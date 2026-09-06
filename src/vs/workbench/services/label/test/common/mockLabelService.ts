/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { basename, normalize } from '../../../../../base/common/path.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFormatterChangeEvent, ILabelService, ResourceLabelFormatter, ResourceLabelFormatting, ResourceLabelTemplateFormatter, Verbosity } from '../../../../../platform/label/common/label.js';
import { IWorkspace, IWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';

function isTemplateFormatter(formatter: ResourceLabelFormatter | ResourceLabelTemplateFormatter): formatter is ResourceLabelTemplateFormatter {
	return URI.isUri(formatter.home);
}

const homeTemplateParameterRegex = /^\$\{(?<name>[a-zA-Z_][\w]*)\}$/;

export class MockLabelService implements ILabelService {
	_serviceBrand: undefined;
	private formatters: (ResourceLabelFormatter | ResourceLabelTemplateFormatter)[] = [];
	private readonly _onDidChangeFormatters = new Emitter<IFormatterChangeEvent>();
	readonly onDidChangeFormatters = this._onDidChangeFormatters.event;

	registerCachedFormatter(formatter: ResourceLabelFormatter): IDisposable {
		return this.registerFormatter(formatter);
	}
	getUriLabel(resource: URI, options?: { relative?: boolean | undefined; noPrefix?: boolean | undefined }): string {
		const formatter = this.findHomeFormatter(resource);
		if (formatter) {
			const relativePath = resource.path.slice(formatter.home.path.length).replace(/^\//, '');
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
	registerFormatter(formatter: ResourceLabelFormatter | ResourceLabelTemplateFormatter): IDisposable {
		this.formatters.push(formatter);
		const scheme = isTemplateFormatter(formatter) ? formatter.home.scheme : formatter.scheme;
		this._onDidChangeFormatters.fire({ scheme });
		const changeListener = isTemplateFormatter(formatter) ? formatter.onDidChangeFormatting(() => this._onDidChangeFormatters.fire({ scheme })) : undefined;
		return {
			dispose: () => {
				changeListener?.dispose();
				this.formatters = this.formatters.filter(candidate => candidate !== formatter);
				this._onDidChangeFormatters.fire({ scheme });
			}
		};
	}

	get formatterCount(): number {
		return this.formatters.length;
	}

	getUriHome(resource: URI): URI | undefined {
		const formatter = this.findHomeFormatter(resource);
		return formatter?.home;
	}

	private findHomeFormatter(resource: URI): { readonly home: URI; readonly formatting: ResourceLabelFormatting } | undefined {
		let result: { readonly home: URI; readonly formatting: ResourceLabelFormatting } | undefined;
		for (const formatter of this.formatters) {
			if (!formatter.home) {
				continue;
			}
			let candidate: { readonly home: URI; readonly formatting: ResourceLabelFormatting } | undefined;
			if (isTemplateFormatter(formatter)) {
				if (formatter.home.scheme !== resource.scheme ||
					(formatter.home.authority && formatter.home.authority.toLowerCase() !== resource.authority.toLowerCase())) {
					continue;
				}
				const homePath = formatter.home.path.length > 1 ? formatter.home.path.replace(/\/+$/, '') : formatter.home.path;
				const parameterNames = new Set<string>();
				const matcherPattern = homePath.split('/').map(segment => {
					const parameterMatch = homeTemplateParameterRegex.exec(segment);
					if (parameterMatch?.groups?.name) {
						const parameterName = parameterMatch.groups.name;
						if (parameterNames.has(parameterName)) {
							throw new Error(`Duplicate resource label home template parameter: ${parameterName}`);
						}
						parameterNames.add(parameterName);
						return `(?<${parameterName}>(?!\\.{1,2}(?:/|$))[^/]+)`;
					}
					if (segment.includes('${')) {
						throw new Error(`Resource label home template parameters must occupy an entire path segment: ${segment}`);
					}
					return escapeRegExpCharacters(segment);
				}).join('/');
				const isRootHome = homePath === '' || homePath === '/';
				const templateMatch = new RegExp(`^${matcherPattern}${isRootHome ? '' : '(?=/|$)'}`).exec(resource.path);
				if (!templateMatch) {
					continue;
				}
				const home = resource.with({ path: templateMatch[0], query: null, fragment: null });
				const formatting = formatter.formatting({ resource, home, parameters: new Map(Object.entries(templateMatch.groups ?? {})) });
				if (formatting) {
					candidate = { home, formatting };
				}
			} else if (formatter.scheme === resource.scheme && (!formatter.authority || formatter.authority === resource.authority) &&
				isEqualOrParent(resource, resource.with({ path: formatter.home }))) {
				candidate = {
					home: resource.with({ path: formatter.home, query: null, fragment: null }),
					formatting: formatter.formatting,
				};
			}
			if (candidate && (!result || candidate.home.path.length > result.home.path.length)) {
				result = candidate;
			}
		}
		return result;
	}

}
