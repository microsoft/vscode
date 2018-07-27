/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { tildify } from 'vs/base/common/labels';
import { ltrim } from 'vs/base/common/strings';

export interface IUriDisplayService {
	_serviceBrand: any;
	getLabel(resource: URI, relative?: boolean): string;
	registerFormater(schema: string, formater: UriDisplayRules): IDisposable;
	onDidRegisterFormater: Event<{ scheme: string, formater: UriDisplayRules }>;
}

export interface UriDisplayRules {
	label: string; // myLabel:/${path}
	separator: '/' | '\\' | '';
	tildify?: boolean;
	normalizeDriveLetter?: boolean;
}

const URI_DISPLAY_SERVICE_ID = 'uriDisplay';
const sepRegexp = /\//g;
const labelMatchingRegexp = /\$\{scheme\}|\$\{authority\}|\$\{path\}/g;

function hasDriveLetter(path: string): boolean {
	return isWindows && path && path[2] === ':';
}

export class UriDisplayService implements IUriDisplayService {
	_serviceBrand: any;

	private readonly formaters = new Map<string, UriDisplayRules>();
	private readonly _onDidRegisterFormater = new Emitter<{ scheme: string, formater: UriDisplayRules }>();

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) { }


	get onDidRegisterFormater(): Event<{ scheme: string, formater: UriDisplayRules }> {
		return this._onDidRegisterFormater.event;
	}

	getLabel(resource: URI, relative: boolean): string {
		if (!resource) {
			return undefined;
		}
		const formater = this.formaters.get(resource.scheme);
		if (!formater) {
			return resource.path;
		}

		if (relative) {
			const baseResource = this.contextService && this.contextService.getWorkspaceFolder(resource);
			if (baseResource) {
				let relativeLabel: string;
				if (isEqual(baseResource.uri, resource, !isLinux)) {
					relativeLabel = ''; // no label if resources are identical
				} else {
					const baseResourceLabel = this.formatUri(baseResource.uri, formater);
					relativeLabel = ltrim(this.formatUri(resource, formater).substring(baseResourceLabel.length), formater.separator);
				}

				const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
				if (hasMultipleRoots) {
					const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
					relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
				}

				return relativeLabel;
			}
		}

		return this.formatUri(resource, formater);
	}

	registerFormater(scheme: string, formater: UriDisplayRules): IDisposable {
		this.formaters.set(scheme, formater);
		this._onDidRegisterFormater.fire({ scheme, formater });

		return {
			dispose: () => this.formaters.delete(scheme)
		};
	}

	private formatUri(resource: URI, formater: UriDisplayRules): string {
		let label = formater.label.replace(labelMatchingRegexp, match => {
			switch (match) {
				case '${scheme}': return resource.scheme;
				case '${authority}': return resource.authority;
				case '${path}': return resource.path;
				default: return '';
			}
		});

		// convert \c:\something => C:\something
		if (formater.normalizeDriveLetter && hasDriveLetter(label)) {
			label = label.charAt(1).toUpperCase() + label.substr(2);
		}

		if (formater.tildify) {
			label = tildify(label, this.environmentService.userHome);
		}

		return label.replace(sepRegexp, formater.separator);
	}
}

export const IUriDisplayService = createDecorator<IUriDisplayService>(URI_DISPLAY_SERVICE_ID);
