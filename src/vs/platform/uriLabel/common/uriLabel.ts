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
import { tildify, getPathLabel } from 'vs/base/common/labels';
import { ltrim } from 'vs/base/common/strings';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { localize } from 'vs/nls';
import { isParent } from 'vs/platform/files/common/files';
import { basename, dirname, join } from 'vs/base/common/paths';

export interface IUriLabelService {
	_serviceBrand: any;
	getLabel(resource: URI, relative?: boolean, forceNoTildify?: boolean): string;
	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier), options?: { verbose: boolean }): string;
	registerFormater(schema: string, formater: UriLabelRules): IDisposable;
	onDidRegisterFormater: Event<{ scheme: string, formater: UriLabelRules }>;
}

export interface UriLabelRules {
	label: string; // myLabel:/${path}
	separator: '/' | '\\' | '';
	tildify?: boolean;
	normalizeDriveLetter?: boolean;
}

const URI_LABEL_SERVICE_ID = 'uriLabel';
const sepRegexp = /\//g;
const labelMatchingRegexp = /\$\{scheme\}|\$\{authority\}|\$\{path\}/g;

function hasDriveLetter(path: string): boolean {
	return isWindows && path && path[2] === ':';
}

export class UriLabelService implements IUriLabelService {
	_serviceBrand: any;

	private readonly formaters = new Map<string, UriLabelRules>();
	private readonly _onDidRegisterFormater = new Emitter<{ scheme: string, formater: UriLabelRules }>();
	private contextService: IWorkspaceContextService;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
	) { }

	get onDidRegisterFormater(): Event<{ scheme: string, formater: UriLabelRules }> {
		return this._onDidRegisterFormater.event;
	}

	acquireContextService(contextService: IWorkspaceContextService): void {
		this.contextService = contextService;
	}

	getLabel(resource: URI, relative?: boolean, forceNoTildify?: boolean): string {
		if (!resource) {
			return undefined;
		}
		const formater = this.formaters.get(resource.scheme);
		if (!formater) {
			return getPathLabel(resource.path, this.environmentService, relative ? this.contextService : undefined);
		}

		if (relative) {
			const baseResource = this.contextService && this.contextService.getWorkspaceFolder(resource);
			if (baseResource) {
				let relativeLabel: string;
				if (isEqual(baseResource.uri, resource, !isLinux)) {
					relativeLabel = ''; // no label if resources are identical
				} else {
					const baseResourceLabel = this.formatUri(baseResource.uri, formater, forceNoTildify);
					relativeLabel = ltrim(this.formatUri(resource, formater, forceNoTildify).substring(baseResourceLabel.length), formater.separator);
				}

				const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
				if (hasMultipleRoots) {
					const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
					relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
				}

				return relativeLabel;
			}
		}

		return this.formatUri(resource, formater, forceNoTildify);
	}

	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier), options?: { verbose: boolean }): string {
		// Workspace: Single Folder
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			// Folder on disk
			return options && options.verbose ? this.getLabel(workspace) : basenameOrAuthority(workspace);
		}

		// Workspace: Untitled
		if (isParent(workspace.configPath, this.environmentService.workspacesHome, !isLinux /* ignore case */)) {
			return localize('untitledWorkspace', "Untitled (Workspace)");
		}

		// Workspace: Saved
		const filename = basename(workspace.configPath);
		const workspaceName = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
		if (options && options.verbose) {
			return localize('workspaceNameVerbose', "{0} (Workspace)", this.getLabel(URI.file(join(dirname(workspace.configPath), workspaceName))));
		}

		return localize('workspaceName', "{0} (Workspace)", workspaceName);
	}

	registerFormater(scheme: string, formater: UriLabelRules): IDisposable {
		this.formaters.set(scheme, formater);
		this._onDidRegisterFormater.fire({ scheme, formater });

		return {
			dispose: () => this.formaters.delete(scheme)
		};
	}

	private formatUri(resource: URI, formater: UriLabelRules, forceNoTildify: boolean): string {
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

		if (formater.tildify && !forceNoTildify) {
			label = tildify(label, this.environmentService.userHome);
		}

		return label.replace(sepRegexp, formater.separator);
	}
}

export const IUriLabelService = createDecorator<IUriLabelService>(URI_LABEL_SERVICE_ID);
