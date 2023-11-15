/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isEqualOrParent, joinPath, relativePath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceStateFolder } from 'vs/platform/userDataSync/common/userDataSync';
import { EditSessionIdentityMatch, IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export const IWorkspaceIdentityService = createDecorator<IWorkspaceIdentityService>('IWorkspaceIdentityService');
export interface IWorkspaceIdentityService {
	_serviceBrand: undefined;
	matches(folders: IWorkspaceStateFolder[], cancellationToken: CancellationToken): Promise<((obj: any) => any) | false>;
	getWorkspaceStateFolders(cancellationToken: CancellationToken): Promise<IWorkspaceStateFolder[]>;
}

export class WorkspaceIdentityService implements IWorkspaceIdentityService {
	declare _serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditSessionIdentityService private readonly editSessionIdentityService: IEditSessionIdentityService
	) { }

	async getWorkspaceStateFolders(cancellationToken: CancellationToken): Promise<IWorkspaceStateFolder[]> {
		const workspaceStateFolders: IWorkspaceStateFolder[] = [];

		for (const workspaceFolder of this.workspaceContextService.getWorkspace().folders) {
			const workspaceFolderIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
			if (!workspaceFolderIdentity) { continue; }
			workspaceStateFolders.push({ resourceUri: workspaceFolder.uri.toString(), workspaceFolderIdentity });
		}

		return workspaceStateFolders;
	}

	async matches(incomingWorkspaceFolders: IWorkspaceStateFolder[], cancellationToken: CancellationToken): Promise<((value: any) => any) | false> {
		const incomingToCurrentWorkspaceFolderUris: { [key: string]: string } = {};

		const incomingIdentitiesToIncomingWorkspaceFolders: { [key: string]: string } = {};
		for (const workspaceFolder of incomingWorkspaceFolders) {
			incomingIdentitiesToIncomingWorkspaceFolders[workspaceFolder.workspaceFolderIdentity] = workspaceFolder.resourceUri;
		}

		// Precompute the identities of the current workspace folders
		const currentWorkspaceFoldersToIdentities = new Map<IWorkspaceFolder, string>();
		for (const workspaceFolder of this.workspaceContextService.getWorkspace().folders) {
			const workspaceFolderIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
			if (!workspaceFolderIdentity) { continue; }
			currentWorkspaceFoldersToIdentities.set(workspaceFolder, workspaceFolderIdentity);
		}

		// Match the current workspace folders to the incoming workspace folders
		for (const [currentWorkspaceFolder, currentWorkspaceFolderIdentity] of currentWorkspaceFoldersToIdentities.entries()) {

			// Happy case: identities do not need further disambiguation
			const incomingWorkspaceFolder = incomingIdentitiesToIncomingWorkspaceFolders[currentWorkspaceFolderIdentity];
			if (incomingWorkspaceFolder) {
				// There is an incoming workspace folder with the exact same identity as the current workspace folder
				incomingToCurrentWorkspaceFolderUris[incomingWorkspaceFolder] = currentWorkspaceFolder.uri.toString();
				continue;
			}

			// Unhappy case: compare the identity of the current workspace folder to all incoming workspace folder identities
			let hasCompleteMatch = false;
			for (const [incomingIdentity, incomingFolder] of Object.entries(incomingIdentitiesToIncomingWorkspaceFolders)) {
				if (await this.editSessionIdentityService.provideEditSessionIdentityMatch(currentWorkspaceFolder, currentWorkspaceFolderIdentity, incomingIdentity, cancellationToken) === EditSessionIdentityMatch.Complete) {
					incomingToCurrentWorkspaceFolderUris[incomingFolder] = currentWorkspaceFolder.uri.toString();
					hasCompleteMatch = true;
					break;
				}
			}

			if (hasCompleteMatch) {
				continue;
			}

			return false;
		}

		const convertUri = (uriToConvert: URI) => {
			// Figure out which current folder the incoming URI is a child of
			for (const incomingFolderUriKey of Object.keys(incomingToCurrentWorkspaceFolderUris)) {
				const incomingFolderUri = URI.parse(incomingFolderUriKey);
				if (isEqualOrParent(incomingFolderUri, uriToConvert)) {
					const currentWorkspaceFolderUri = incomingToCurrentWorkspaceFolderUris[incomingFolderUriKey];

					// Compute the relative file path section of the uri to convert relative to the folder it came from
					const relativeFilePath = relativePath(incomingFolderUri, uriToConvert);

					// Reparent the relative file path under the current workspace folder it belongs to
					if (relativeFilePath) {
						return joinPath(URI.parse(currentWorkspaceFolderUri), relativeFilePath);
					}
				}
			}

			// No conversion was possible; return the original URI
			return uriToConvert;
		};

		// Recursively look for any URIs in the provided object and
		// replace them with the URIs of the current workspace folders
		const uriReplacer = (obj: any, depth = 0) => {
			if (!obj || depth > 200) {
				return obj;
			}

			if (obj instanceof VSBuffer || obj instanceof Uint8Array) {
				return <any>obj;
			}

			if (URI.isUri(obj)) {
				return convertUri(obj);
			}

			if (Array.isArray(obj)) {
				for (let i = 0; i < obj.length; ++i) {
					obj[i] = uriReplacer(obj[i], depth + 1);
				}
			} else {
				// walk object
				for (const key in obj) {
					if (Object.hasOwnProperty.call(obj, key)) {
						obj[key] = uriReplacer(obj[key], depth + 1);
					}
				}
			}

			return obj;
		};

		return uriReplacer;
	}
}

registerSingleton(IWorkspaceIdentityService, WorkspaceIdentityService, InstantiationType.Delayed);
