/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { tildify, getPathLabel } from 'vs/base/common/labels';
import { ltrim } from 'vs/base/common/strings';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, WORKSPACE_EXTENSION, toWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { localize } from 'vs/nls';
import { isParent } from 'vs/platform/files/common/files';
import { basename, dirname, join } from 'vs/base/common/paths';

export interface ILabelService {
	_serviceBrand: any;
	getUriLabel(resource: URI, relative?: boolean, forceNoTildify?: boolean): string;
	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWorkspace), options?: { verbose: boolean }): string;
	registerFormatter(schema: string, formatter: LabelRules): IDisposable;
	onDidRegisterFormatter: Event<{ scheme: string, formatter: LabelRules }>;
}

export interface LabelRules {
	uri: {
		label: string; // myLabel:/${path}
		separator: '/' | '\\' | '';
		tildify?: boolean;
		normalizeDriveLetter?: boolean;
	};
	workspace?: {
		suffix: string;
	};
}

const LABEL_SERVICE_ID = 'label';
const sepRegexp = /\//g;
const labelMatchingRegexp = /\$\{scheme\}|\$\{authority\}|\$\{path\}/g;

function hasDriveLetter(path: string): boolean {
	return isWindows && path && path[2] === ':';
}

export class LabelService implements ILabelService {
	_serviceBrand: any;

	private readonly formatters = new Map<string, LabelRules>();
	private readonly _onDidRegisterFormatter = new Emitter<{ scheme: string, formatter: LabelRules }>();

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) { }

	get onDidRegisterFormatter(): Event<{ scheme: string, formatter: LabelRules }> {
		return this._onDidRegisterFormatter.event;
	}

	getUriLabel(resource: URI, relative?: boolean, forceNoTildify?: boolean): string {
		if (!resource) {
			return undefined;
		}
		const formatter = this.formatters.get(resource.scheme);
		if (!formatter) {
			return getPathLabel(resource.path, this.environmentService, relative ? this.contextService : undefined);
		}

		if (relative) {
			const baseResource = this.contextService && this.contextService.getWorkspaceFolder(resource);
			if (baseResource) {
				let relativeLabel: string;
				if (isEqual(baseResource.uri, resource, !isLinux)) {
					relativeLabel = ''; // no label if resources are identical
				} else {
					const baseResourceLabel = this.formatUri(baseResource.uri, formatter, forceNoTildify);
					relativeLabel = ltrim(this.formatUri(resource, formatter, forceNoTildify).substring(baseResourceLabel.length), formatter.uri.separator);
				}

				const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
				if (hasMultipleRoots) {
					const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
					relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
				}

				return relativeLabel;
			}
		}

		return this.formatUri(resource, formatter, forceNoTildify);
	}

	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWorkspace), options?: { verbose: boolean }): string {
		if (!isWorkspaceIdentifier(workspace) && !isSingleFolderWorkspaceIdentifier(workspace)) {
			workspace = toWorkspaceIdentifier(workspace);
			if (!workspace) {
				return '';
			}
		}

		// Workspace: Single Folder
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			// Folder on disk
			const formatter = this.formatters.get(workspace.scheme);
			const label = options && options.verbose ? this.getUriLabel(workspace) : basenameOrAuthority(workspace);
			const suffix = formatter && formatter.workspace && (typeof formatter.workspace.suffix === 'string') ? formatter.workspace.suffix : workspace.scheme;
			return suffix ? `${label} (${suffix})` : label;
		}

		// Workspace: Untitled
		if (isParent(workspace.configPath, this.environmentService.workspacesHome, !isLinux /* ignore case */)) {
			return localize('untitledWorkspace', "Untitled (Workspace)");
		}

		// Workspace: Saved
		const filename = basename(workspace.configPath);
		const workspaceName = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
		if (options && options.verbose) {
			return localize('workspaceNameVerbose', "{0} (Workspace)", this.getUriLabel(URI.file(join(dirname(workspace.configPath), workspaceName))));
		}

		return localize('workspaceName', "{0} (Workspace)", workspaceName);
	}

	registerFormatter(scheme: string, formatter: LabelRules): IDisposable {
		this.formatters.set(scheme, formatter);
		this._onDidRegisterFormatter.fire({ scheme, formatter });

		return {
			dispose: () => this.formatters.delete(scheme)
		};
	}

	private formatUri(resource: URI, formatter: LabelRules, forceNoTildify: boolean): string {
		let label = formatter.uri.label.replace(labelMatchingRegexp, match => {
			switch (match) {
				case '${scheme}': return resource.scheme;
				case '${authority}': return resource.authority;
				case '${path}': return resource.path;
				default: return '';
			}
		});

		// convert \c:\something => C:\something
		if (formatter.uri.normalizeDriveLetter && hasDriveLetter(label)) {
			label = label.charAt(1).toUpperCase() + label.substr(2);
		}

		if (formatter.uri.tildify && !forceNoTildify) {
			label = tildify(label, this.environmentService.userHome);
		}

		return label.replace(sepRegexp, formatter.uri.separator);
	}
}

export const ILabelService = createDecorator<ILabelService>(LABEL_SERVICE_ID);
