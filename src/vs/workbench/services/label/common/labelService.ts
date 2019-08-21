/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { isEqual, basenameOrAuthority, isEqualOrParent, basename, joinPath, dirname } from 'vs/base/common/resources';
import { isWindows } from 'vs/base/common/platform';
import { tildify, getPathLabel } from 'vs/base/common/labels';
import { ltrim, endsWith } from 'vs/base/common/strings';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, WORKSPACE_EXTENSION, toWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { ILabelService, ResourceLabelFormatter, ResourceLabelFormatting } from 'vs/platform/label/common/label';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { match } from 'vs/base/common/glob';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

const resourceLabelFormattersExtPoint = ExtensionsRegistry.registerExtensionPoint<ResourceLabelFormatter[]>({
	extensionPoint: 'resourceLabelFormatters',
	jsonSchema: {
		description: localize('vscode.extension.contributes.resourceLabelFormatters', 'Contributes resource label formatting rules.'),
		type: 'array',
		items: {
			type: 'object',
			required: ['scheme', 'formatting'],
			properties: {
				scheme: {
					type: 'string',
					description: localize('vscode.extension.contributes.resourceLabelFormatters.scheme', 'URI scheme on which to match the formatter on. For example "file". Simple glob patterns are supported.'),
				},
				authority: {
					type: 'string',
					description: localize('vscode.extension.contributes.resourceLabelFormatters.authority', 'URI authority on which to match the formatter on. Simple glob patterns are supported.'),
				},
				formatting: {
					description: localize('vscode.extension.contributes.resourceLabelFormatters.formatting', "Rules for formatting uri resource labels."),
					type: 'object',
					properties: {
						label: {
							type: 'string',
							description: localize('vscode.extension.contributes.resourceLabelFormatters.label', "Label rules to display. For example: myLabel:/${path}. ${path}, ${scheme} and ${authority} are supported as variables.")
						},
						separator: {
							type: 'string',
							description: localize('vscode.extension.contributes.resourceLabelFormatters.separator', "Separator to be used in the uri label display. '/' or '\' as an example.")
						},
						tildify: {
							type: 'boolean',
							description: localize('vscode.extension.contributes.resourceLabelFormatters.tildify', "Controls if the start of the uri label should be tildified when possible.")
						},
						workspaceSuffix: {
							type: 'string',
							description: localize('vscode.extension.contributes.resourceLabelFormatters.formatting.workspaceSuffix', "Suffix appended to the workspace label.")
						}
					}
				}
			}
		}
	}
});

const sepRegexp = /\//g;
const labelMatchingRegexp = /\$\{(scheme|authority|path|(query)\.(.+?))\}/g;

function hasDriveLetter(path: string): boolean {
	return !!(isWindows && path && path[2] === ':');
}

class ResourceLabelFormattersHandler implements IWorkbenchContribution {
	private formattersDisposables = new Map<ResourceLabelFormatter, IDisposable>();

	constructor(@ILabelService labelService: ILabelService) {
		resourceLabelFormattersExtPoint.setHandler((extensions, delta) => {
			delta.added.forEach(added => added.value.forEach(formatter => {
				this.formattersDisposables.set(formatter, labelService.registerFormatter(formatter));
			}));
			delta.removed.forEach(removed => removed.value.forEach(formatter => {
				this.formattersDisposables.get(formatter)!.dispose();
			}));
		});
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ResourceLabelFormattersHandler, LifecyclePhase.Restored);

export class LabelService implements ILabelService {
	_serviceBrand: any;

	private formatters: ResourceLabelFormatter[] = [];
	private readonly _onDidChangeFormatters = new Emitter<void>();

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
	) { }

	get onDidChangeFormatters(): Event<void> {
		return this._onDidChangeFormatters.event;
	}

	findFormatting(resource: URI): ResourceLabelFormatting | undefined {
		let bestResult: ResourceLabelFormatter | undefined;

		this.formatters.forEach(formatter => {
			if (formatter.scheme === resource.scheme) {
				if (!bestResult && !formatter.authority) {
					bestResult = formatter;
					return;
				}
				if (!formatter.authority) {
					return;
				}

				if (match(formatter.authority, resource.authority) && (!bestResult || !bestResult.authority || formatter.authority.length > bestResult.authority.length || ((formatter.authority.length === bestResult.authority.length) && formatter.priority))) {
					bestResult = formatter;
				}
			}
		});

		return bestResult ? bestResult.formatting : undefined;
	}

	getUriLabel(resource: URI, options: { relative?: boolean, noPrefix?: boolean, endWithSeparator?: boolean } = {}): string {
		const formatting = this.findFormatting(resource);
		if (!formatting) {
			return getPathLabel(resource.path, this.environmentService, options.relative ? this.contextService : undefined);
		}

		let label: string | undefined;
		const baseResource = this.contextService && this.contextService.getWorkspaceFolder(resource);

		if (options.relative && baseResource) {
			let relativeLabel: string;
			if (isEqual(baseResource.uri, resource)) {
				relativeLabel = ''; // no label if resources are identical
			} else {
				const baseResourceLabel = this.formatUri(baseResource.uri, formatting, options.noPrefix);
				relativeLabel = ltrim(this.formatUri(resource, formatting, options.noPrefix).substring(baseResourceLabel.length), formatting.separator);
			}

			const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
			if (hasMultipleRoots && !options.noPrefix) {
				const rootName = (baseResource && baseResource.name) ? baseResource.name : basenameOrAuthority(baseResource.uri);
				relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
			}

			label = relativeLabel;
		} else {
			label = this.formatUri(resource, formatting, options.noPrefix);
		}

		return options.endWithSeparator ? this.appendSeparatorIfMissing(label, formatting) : label;
	}

	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWorkspace), options?: { verbose: boolean }): string {
		if (IWorkspace.isIWorkspace(workspace)) {
			const identifier = toWorkspaceIdentifier(workspace);
			if (!identifier) {
				return '';
			}

			workspace = identifier;
		}

		// Workspace: Single Folder
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			// Folder on disk
			const label = options && options.verbose ? this.getUriLabel(workspace) : basename(workspace) || '/';
			return this.appendWorkspaceSuffix(label, workspace);
		}

		if (isWorkspaceIdentifier(workspace)) {
			// Workspace: Untitled
			if (isEqualOrParent(workspace.configPath, this.environmentService.untitledWorkspacesHome)) {
				return localize('untitledWorkspace', "Untitled (Workspace)");
			}

			// Workspace: Saved
			let filename = basename(workspace.configPath);
			if (endsWith(filename, WORKSPACE_EXTENSION)) {
				filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
			}
			let label;
			if (options && options.verbose) {
				label = localize('workspaceNameVerbose', "{0} (Workspace)", this.getUriLabel(joinPath(dirname(workspace.configPath), filename)));
			} else {
				label = localize('workspaceName', "{0} (Workspace)", filename);
			}
			return this.appendWorkspaceSuffix(label, workspace.configPath);
		}
		return '';

	}

	getSeparator(scheme: string, authority?: string): '/' | '\\' {
		const formatter = this.findFormatting(URI.from({ scheme, authority }));
		return formatter && formatter.separator || '/';
	}

	getHostLabel(scheme: string, authority?: string): string {
		const formatter = this.findFormatting(URI.from({ scheme, authority }));
		return formatter && formatter.workspaceSuffix || '';
	}

	registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		this.formatters.push(formatter);
		this._onDidChangeFormatters.fire();

		return {
			dispose: () => {
				this.formatters = this.formatters.filter(f => f !== formatter);
				this._onDidChangeFormatters.fire();
			}
		};
	}

	private formatUri(resource: URI, formatting: ResourceLabelFormatting, forceNoTildify?: boolean): string {
		let label = formatting.label.replace(labelMatchingRegexp, (match, token, qsToken, qsValue) => {
			switch (token) {
				case 'scheme': return resource.scheme;
				case 'authority': return resource.authority;
				case 'path': return resource.path;
				default: {
					if (qsToken === 'query') {
						const { query } = resource;
						if (query && query[0] === '{' && query[query.length - 1] === '}') {
							try {
								return JSON.parse(query)[qsValue] || '';
							}
							catch { }
						}
					}
					return '';
				}
			}
		});

		// convert \c:\something => C:\something
		if (formatting.normalizeDriveLetter && hasDriveLetter(label)) {
			label = label.charAt(1).toUpperCase() + label.substr(2);
		}

		if (formatting.tildify && !forceNoTildify) {
			label = tildify(label, this.environmentService.userHome);
		}
		if (formatting.authorityPrefix && resource.authority) {
			label = formatting.authorityPrefix + label;
		}

		return label.replace(sepRegexp, formatting.separator);
	}

	private appendSeparatorIfMissing(label: string, formatting: ResourceLabelFormatting): string {
		let appendedLabel = label;
		if (!endsWith(label, formatting.separator)) {
			appendedLabel += formatting.separator;
		}
		return appendedLabel;
	}

	private appendWorkspaceSuffix(label: string, uri: URI): string {
		if (uri.scheme === Schemas.file) {
			return label;
		}

		const formatting = this.findFormatting(uri);
		const suffix = formatting && (typeof formatting.workspaceSuffix === 'string') ? formatting.workspaceSuffix : uri.scheme;
		return suffix ? `${label} [${suffix}]` : label;
	}
}

registerSingleton(ILabelService, LabelService, true);
