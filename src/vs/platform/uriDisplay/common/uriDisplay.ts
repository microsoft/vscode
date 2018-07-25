/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { tildify, normalizeDriveLetter } from 'vs/base/common/labels';

export interface IUriDisplayService {
	getLabel(resource: URI, relative: boolean): string;
	registerFormater(schema: string, formater: UriDisplayRules): IDisposable;
}

export interface UriDisplayRules {
	label: string;
	forwardSlash?: boolean;
	tildify?: boolean;
	normalizeDriveLetter?: boolean;
}

const URI_DISPLAY_SERVICE_ID = 'uriDisplay';

function hasDriveLetter(path: string): boolean {
	return isWindows && path && path[1] === ':';
}

class UriDisplayService implements IUriDisplayService {
	public _serviceBrand: any;
	private formaters = new Map<string, UriDisplayRules>();

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) { }

	getLabel(resource: URI, relative: boolean): string {
		if (!resource) {
			return undefined;
		}

		if (relative) {
			const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
			const baseResource = this.contextService.getWorkspaceFolder(resource);

			let pathLabel: string;
			if (isEqual(baseResource.uri, resource, !isLinux)) {
				pathLabel = ''; // no label if paths are identical
			} else {
				const baseResourceLabel = this.formatUri(baseResource.uri);
				pathLabel = this.formatUri(resource).substring(baseResourceLabel.length);
			}

			if (hasMultipleRoots) {
				const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
				pathLabel = pathLabel ? (rootName + ' • ' + pathLabel) : rootName; // always show root basename if there are multiple
			}

			return pathLabel;
		}

		return this.formatUri(resource);
	}

	registerFormater(scheme: string, formater: UriDisplayRules): IDisposable {
		this.formaters.set(scheme, formater);

		return {
			dispose: () => this.formaters.delete(scheme)
		};
	}

	private formatUri(resource: URI): string {
		const formater = this.formaters.get(resource.scheme);
		if (!formater) {
			return resource.with({ query: null, fragment: null }).toString(true);
		}

		// TODO@isidor transform
		let label = resource.path;

		// convert c:\something => C:\something
		if (formater.normalizeDriveLetter && hasDriveLetter(label)) {
			label = normalizeDriveLetter(label);
		}

		// normalize and tildify (macOS, Linux only)
		if (formater.tildify) {
			label = tildify(label, this.environmentService.userHome);
		}

		return label;
	}
}

// register service
const IUriDisplayService = createDecorator<IUriDisplayService>(URI_DISPLAY_SERVICE_ID);
registerSingleton(IUriDisplayService, UriDisplayService);
