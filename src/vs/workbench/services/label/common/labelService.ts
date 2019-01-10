/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { isEqual, basenameOrAuthority } from 'vs/base/common/resources';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { tildify, getPathLabel } from 'vs/base/common/labels';
import { ltrim, startsWith } from 'vs/base/common/strings';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, WORKSPACE_EXTENSION, toWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { isParent } from 'vs/platform/files/common/files';
import { basename, dirname, join } from 'vs/base/common/paths';
import { Schemas } from 'vs/base/common/network';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { ILabelService, LabelRules, RegisterFormatterData } from 'vs/platform/label/common/label';

const sepRegexp = /\//g;
const labelMatchingRegexp = /\$\{scheme\}|\$\{authority\}|\$\{path\}/g;

function hasDriveLetter(path: string): boolean {
	return !!(isWindows && path && path[2] === ':');
}


export class LabelService implements ILabelService {
	_serviceBrand: any;

	private readonly formatters: { [prefix: string]: LabelRules } = Object.create(null);
	private readonly _onDidRegisterFormatter = new Emitter<RegisterFormatterData>();

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWindowService private readonly windowService: IWindowService
	) { }

	get onDidRegisterFormatter(): Event<RegisterFormatterData> {
		return this._onDidRegisterFormatter.event;
	}

	findFormatter(resource: URI): LabelRules | undefined {
		const path = `${resource.scheme}://${resource.authority}`;
		let bestPrefix = '';
		for (let prefix in this.formatters) {
			if (startsWith(path, prefix) && prefix.length > bestPrefix.length) {
				bestPrefix = prefix;
			}
		}
		if (bestPrefix.length) {
			return this.formatters[bestPrefix];
		}
		return undefined;
	}

	getUriLabel(resource: URI, options: { relative?: boolean, noPrefix?: boolean } = {}): string {
		const formatter = this.findFormatter(resource);
		if (!formatter) {
			return getPathLabel(resource.path, this.environmentService, options.relative ? this.contextService : undefined);
		}

		if (options.relative) {
			const baseResource = this.contextService && this.contextService.getWorkspaceFolder(resource);
			if (baseResource) {
				let relativeLabel: string;
				if (isEqual(baseResource.uri, resource, !isLinux)) {
					relativeLabel = ''; // no label if resources are identical
				} else {
					const baseResourceLabel = this.formatUri(baseResource.uri, formatter, options.noPrefix);
					relativeLabel = ltrim(this.formatUri(resource, formatter, options.noPrefix).substring(baseResourceLabel.length), formatter.uri.separator);
				}

				const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
				if (hasMultipleRoots && !options.noPrefix) {
					const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
					relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
				}

				return relativeLabel;
			}
		}

		return this.formatUri(resource, formatter, options.noPrefix);
	}

	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWorkspace), options?: { verbose: boolean }): string {
		if (!isWorkspaceIdentifier(workspace) && !isSingleFolderWorkspaceIdentifier(workspace)) {
			const identifier = toWorkspaceIdentifier(workspace);
			if (!identifier) {
				return '';
			}

			workspace = identifier;
		}

		// Workspace: Single Folder
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			// Folder on disk
			const formatter = this.findFormatter(workspace);
			const label = options && options.verbose ? this.getUriLabel(workspace) : basenameOrAuthority(workspace);
			if (workspace.scheme === Schemas.file) {
				return label;
			}

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

	getHostLabel(): string {
		if (this.windowService) {
			const authority = this.windowService.getConfiguration().remoteAuthority;
			if (authority) {
				const formatter = this.findFormatter(URI.from({ scheme: REMOTE_HOST_SCHEME, authority }));
				if (formatter && formatter.workspace) {
					return formatter.workspace.suffix;
				}
			}
		}
		return '';
	}

	registerFormatter(selector: string, formatter: LabelRules): IDisposable {
		this.formatters[selector] = formatter;
		this._onDidRegisterFormatter.fire({ selector, formatter });

		return {
			dispose: () => delete this.formatters[selector]
		};
	}

	private formatUri(resource: URI, formatter: LabelRules, forceNoTildify?: boolean): string {
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
		if (formatter.uri.authorityPrefix && resource.authority) {
			label = formatter.uri.authorityPrefix + label;
		}

		return label.replace(sepRegexp, formatter.uri.separator);
	}
}
