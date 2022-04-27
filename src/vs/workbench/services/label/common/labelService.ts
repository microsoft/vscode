/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/path';
import { Emitter } from 'vs/base/common/event';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService, IWorkspace, isWorkspace, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier, toWorkspaceIdentifier, WORKSPACE_EXTENSION, isUntitledWorkspace, isTemporaryWorkspace } from 'vs/platform/workspace/common/workspace';
import { basenameOrAuthority, basename, joinPath, dirname, toLocalResource } from 'vs/base/common/resources';
import { tildify, getPathLabel } from 'vs/base/common/labels';
import { ILabelService, ResourceLabelFormatter, ResourceLabelFormatting, IFormatterChangeEvent } from 'vs/platform/label/common/label';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { match } from 'vs/base/common/glob';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import { OS } from 'vs/base/common/platform';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { Schemas } from 'vs/base/common/network';

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
						stripPathStartingSeparator: {
							type: 'boolean',
							description: localize('vscode.extension.contributes.resourceLabelFormatters.stripPathStartingSeparator', "Controls whether `${path}` substitutions should have starting separator characters stripped.")
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

function hasDriveLetterIgnorePlatform(path: string): boolean {
	return !!(path && path[2] === ':');
}

class ResourceLabelFormattersHandler implements IWorkbenchContribution {
	private formattersDisposables = new Map<ResourceLabelFormatter, IDisposable>();

	constructor(@ILabelService labelService: ILabelService) {
		resourceLabelFormattersExtPoint.setHandler((extensions, delta) => {
			delta.added.forEach(added => added.value.forEach(formatter => {
				if (!isProposedApiEnabled(added.description, 'contribLabelFormatterWorkspaceTooltip') && formatter.formatting.workspaceTooltip) {
					// workspaceTooltip is only proposed
					formatter.formatting.workspaceTooltip = undefined;
				}
				this.formattersDisposables.set(formatter, labelService.registerFormatter(formatter));
			}));
			delta.removed.forEach(removed => removed.value.forEach(formatter => {
				this.formattersDisposables.get(formatter)!.dispose();
			}));
		});
	}
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ResourceLabelFormattersHandler, LifecyclePhase.Restored);

export class LabelService extends Disposable implements ILabelService {

	declare readonly _serviceBrand: undefined;

	private formatters: ResourceLabelFormatter[] = [];

	private readonly _onDidChangeFormatters = this._register(new Emitter<IFormatterChangeEvent>({ leakWarningThreshold: 400 }));
	readonly onDidChangeFormatters = this._onDidChangeFormatters.event;

	private os = OS;
	private userHome: URI | undefined = undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IPathService private readonly pathService: IPathService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService
	) {
		super();

		// Resolve OS & Paths with remote in mind
		this.resolveEnvironment();
	}

	private async resolveEnvironment(): Promise<void> {

		// OS
		const env = await this.remoteAgentService.getEnvironment();
		this.os = env?.os ?? OS;

		// User home
		this.userHome = await this.pathService.userHome();
	}

	findFormatting(resource: URI): ResourceLabelFormatting | undefined {
		let bestResult: ResourceLabelFormatter | undefined;

		this.formatters.forEach(formatter => {
			if (formatter.scheme === resource.scheme) {
				if (!formatter.authority && (!bestResult || formatter.priority)) {
					bestResult = formatter;
					return;
				}
				if (!formatter.authority) {
					return;
				}

				if (match(formatter.authority.toLowerCase(), resource.authority.toLowerCase()) && (!bestResult || !bestResult.authority || formatter.authority.length > bestResult.authority.length || ((formatter.authority.length === bestResult.authority.length) && formatter.priority))) {
					bestResult = formatter;
				}
			}
		});

		return bestResult ? bestResult.formatting : undefined;
	}

	getUriLabel(resource: URI, options: { relative?: boolean; noPrefix?: boolean; endWithSeparator?: boolean; separator?: '/' | '\\' } = {}): string {
		let formatting = this.findFormatting(resource);
		if (formatting && options.separator) {
			// mixin separator if defined from the outside
			formatting = { ...formatting, separator: options.separator };
		}

		const label = this.doGetUriLabel(resource, formatting, options);

		// Without formatting we still need to support the separator
		// as provided in options (https://github.com/microsoft/vscode/issues/130019)
		if (!formatting && options.separator) {
			return label.replace(sepRegexp, options.separator);
		}

		return label;
	}

	private doGetUriLabel(resource: URI, formatting?: ResourceLabelFormatting, options: { relative?: boolean; noPrefix?: boolean; endWithSeparator?: boolean } = {}): string {
		if (!formatting) {

			// Without a formatter we have to fallback to figuring out what the
			// label could be that best matches the environment and workspace
			// the user is in.
			// As such, if the resource is with unfamiliar scheme, we convert it
			// to the default scheme and remote authority.

			if (resource.scheme !== this.pathService.defaultUriScheme && resource.scheme !== Schemas.untitled) {
				resource = toLocalResource(resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
			}

			return getPathLabel(resource, {
				os: this.os,
				tildify: this.userHome ? { userHome: this.userHome } : undefined,
				relative: options.relative ? this.contextService : undefined
			});
		}

		let label: string | undefined;
		const baseResource = this.contextService?.getWorkspaceFolder(resource);

		if (options.relative && baseResource) {
			const baseResourceLabel = this.formatUri(baseResource.uri, formatting, options.noPrefix);
			let relativeLabel = this.formatUri(resource, formatting, options.noPrefix);

			let overlap = 0;
			while (relativeLabel[overlap] && relativeLabel[overlap] === baseResourceLabel[overlap]) { overlap++; }
			if (!relativeLabel[overlap] || relativeLabel[overlap] === formatting.separator) {
				relativeLabel = relativeLabel.substring(1 + overlap);
			} else if (overlap === baseResourceLabel.length && baseResource.uri.path === '/') {
				relativeLabel = relativeLabel.substring(overlap);
			}

			const hasMultipleRoots = this.contextService.getWorkspace().folders.length > 1;
			if (hasMultipleRoots && !options.noPrefix) {
				const rootName = baseResource?.name ?? basenameOrAuthority(baseResource.uri);
				relativeLabel = relativeLabel ? (rootName + ' • ' + relativeLabel) : rootName; // always show root basename if there are multiple
			}

			label = relativeLabel;
		} else {
			label = this.formatUri(resource, formatting, options.noPrefix);
		}

		return options.endWithSeparator ? this.appendSeparatorIfMissing(label, formatting) : label;
	}

	getUriBasenameLabel(resource: URI): string {
		const formatting = this.findFormatting(resource);
		const label = this.doGetUriLabel(resource, formatting);
		if (formatting) {
			switch (formatting.separator) {
				case paths.win32.sep: return paths.win32.basename(label);
				case paths.posix.sep: return paths.posix.basename(label);
			}
		}

		return paths.basename(label);
	}

	getWorkspaceLabel(workspace: IWorkspace | IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI, options?: { verbose: boolean }): string {
		if (isWorkspace(workspace)) {
			const identifier = toWorkspaceIdentifier(workspace);
			if (identifier) {
				return this.getWorkspaceLabel(identifier, options);
			}

			return '';
		}

		// Workspace: Single Folder (as URI)
		if (URI.isUri(workspace)) {
			return this.doGetSingleFolderWorkspaceLabel(workspace, options);
		}

		// Workspace: Single Folder (as workspace identifier)
		if (isSingleFolderWorkspaceIdentifier(workspace)) {
			return this.doGetSingleFolderWorkspaceLabel(workspace.uri, options);
		}

		// Workspace: Multi Root
		if (isWorkspaceIdentifier(workspace)) {
			return this.doGetWorkspaceLabel(workspace.configPath, options);
		}

		return '';
	}

	private doGetWorkspaceLabel(workspaceUri: URI, options?: { verbose: boolean }): string {

		// Workspace: Untitled
		if (isUntitledWorkspace(workspaceUri, this.environmentService)) {
			return localize('untitledWorkspace', "Untitled (Workspace)");
		}

		// Workspace: Temporary
		if (isTemporaryWorkspace(workspaceUri)) {
			return localize('temporaryWorkspace', "Workspace");
		}

		// Workspace: Saved
		let filename = basename(workspaceUri);
		if (filename.endsWith(WORKSPACE_EXTENSION)) {
			filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
		}

		let label: string;
		if (options?.verbose) {
			label = localize('workspaceNameVerbose', "{0} (Workspace)", this.getUriLabel(joinPath(dirname(workspaceUri), filename)));
		} else {
			label = localize('workspaceName', "{0} (Workspace)", filename);
		}

		return this.appendWorkspaceSuffix(label, workspaceUri);
	}

	private doGetSingleFolderWorkspaceLabel(folderUri: URI, options?: { verbose: boolean }): string {
		const label = options?.verbose ? this.getUriLabel(folderUri) : basename(folderUri) || '/';
		return this.appendWorkspaceSuffix(label, folderUri);
	}

	getSeparator(scheme: string, authority?: string): '/' | '\\' {
		const formatter = this.findFormatting(URI.from({ scheme, authority }));
		return formatter?.separator || '/';
	}

	getHostLabel(scheme: string, authority?: string): string {
		const formatter = this.findFormatting(URI.from({ scheme, authority }));
		return formatter?.workspaceSuffix || authority || '';
	}

	getHostTooltip(scheme: string, authority?: string): string | undefined {
		const formatter = this.findFormatting(URI.from({ scheme, authority }));
		return formatter?.workspaceTooltip;
	}

	registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		this.formatters.push(formatter);
		this._onDidChangeFormatters.fire({ scheme: formatter.scheme });

		return {
			dispose: () => {
				this.formatters = this.formatters.filter(f => f !== formatter);
				this._onDidChangeFormatters.fire({ scheme: formatter.scheme });
			}
		};
	}

	private formatUri(resource: URI, formatting: ResourceLabelFormatting, forceNoTildify?: boolean): string {
		let label = formatting.label.replace(labelMatchingRegexp, (match, token, qsToken, qsValue) => {
			switch (token) {
				case 'scheme': return resource.scheme;
				case 'authority': return resource.authority;
				case 'path':
					return formatting.stripPathStartingSeparator
						? resource.path.slice(resource.path[0] === formatting.separator ? 1 : 0)
						: resource.path;
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
		if (formatting.normalizeDriveLetter && hasDriveLetterIgnorePlatform(label)) {
			label = label.charAt(1).toUpperCase() + label.substr(2);
		}

		if (formatting.tildify && !forceNoTildify) {
			if (this.userHome) {
				label = tildify(label, this.userHome.fsPath, this.os);
			}
		}
		if (formatting.authorityPrefix && resource.authority) {
			label = formatting.authorityPrefix + label;
		}

		return label.replace(sepRegexp, formatting.separator);
	}

	private appendSeparatorIfMissing(label: string, formatting: ResourceLabelFormatting): string {
		let appendedLabel = label;
		if (!label.endsWith(formatting.separator)) {
			appendedLabel += formatting.separator;
		}
		return appendedLabel;
	}

	private appendWorkspaceSuffix(label: string, uri: URI): string {
		const formatting = this.findFormatting(uri);
		const suffix = formatting && (typeof formatting.workspaceSuffix === 'string') ? formatting.workspaceSuffix : undefined;
		return suffix ? `${label} [${suffix}]` : label;
	}
}

registerSingleton(ILabelService, LabelService, true);
