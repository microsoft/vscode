/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtUri, isEqualAuthority } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';

const templateParameterRegex = /^\$\{(?<name>[a-zA-Z_][\w]*)\}$/;

type TemplateSegment = { readonly kind: 'literal'; readonly value: string } | { readonly kind: 'parameter'; readonly value: string };

export interface IResourceLabelTemplateMatch {
	readonly home: URI;
	readonly parameters: ReadonlyMap<string, string>;
}

export class ResourceLabelTemplate {

	private readonly segments: readonly TemplateSegment[];
	private readonly isRoot: boolean;

	constructor(private readonly home: URI) {
		const homePath = home.path.length > 1 ? home.path.replace(/\/+$/, '') : home.path;
		this.isRoot = homePath === '' || homePath === '/';
		const parameterNames = new Set<string>();
		this.segments = this.isRoot ? [] : homePath.split('/').map(segment => {
			const parameterMatch = templateParameterRegex.exec(segment);
			if (parameterMatch?.groups?.name) {
				const parameter = parameterMatch.groups.name;
				if (parameterNames.has(parameter)) {
					throw new Error(`Duplicate resource label home template parameter: ${parameter}`);
				}
				parameterNames.add(parameter);
				return { kind: 'parameter', value: parameter };
			}
			if (segment.includes('${')) {
				throw new Error(`Resource label home template parameters must occupy an entire path segment: ${segment}`);
			}
			return { kind: 'literal', value: segment };
		});
	}

	match(resource: URI, extUri: IExtUri): IResourceLabelTemplateMatch | undefined {
		if (this.home.scheme !== resource.scheme || (this.home.authority && !isEqualAuthority(this.home.authority, resource.authority))) {
			return undefined;
		}
		if (this.isRoot) {
			return { home: resource.with({ path: this.home.path, query: null, fragment: null }), parameters: new Map() };
		}

		const resourceSegments = resource.path.split('/');
		if (resourceSegments.length < this.segments.length) {
			return undefined;
		}
		const parameters = new Map<string, string>();
		for (let index = 0; index < this.segments.length; index++) {
			const templateSegment = this.segments[index];
			const resourceSegment = resourceSegments[index];
			if (templateSegment.kind === 'parameter') {
				if (resourceSegment === '.' || resourceSegment === '..') {
					return undefined;
				}
				parameters.set(templateSegment.value, resourceSegment);
				continue;
			}
			const resourceSegmentUri = resource.with({ path: `/${resourceSegment}`, query: null, fragment: null });
			const templateSegmentUri = resource.with({ path: `/${templateSegment.value}`, query: null, fragment: null });
			if (!extUri.isEqual(resourceSegmentUri, templateSegmentUri)) {
				return undefined;
			}
		}
		return {
			home: resource.with({ path: resourceSegments.slice(0, this.segments.length).join('/'), query: null, fragment: null }),
			parameters,
		};
	}
}
