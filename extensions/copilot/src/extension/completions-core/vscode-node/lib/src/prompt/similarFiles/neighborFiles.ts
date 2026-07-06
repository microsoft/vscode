/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { normalizeLanguageId, SimilarFileInfo } from '../../../../prompt/src/prompt';
import { CancellationToken as ICancellationToken } from '../../../../types/src';
import { ICompletionsFeaturesService } from '../../experiments/featuresService';
import { ICompletionsLogTargetService } from '../../logger';
import { TelemetryWithExp } from '../../telemetry';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import { OpenTabFiles } from './openTabFiles';
import { getRelatedFilesAndTraits, relatedFilesLogger, RelatedFileTrait } from './relatedFiles';

// There is a limitation of the number of the neighbor files. So I use the next strategies to pick the most relevant cursor focused files.
export enum NeighboringFileType {
	None = 'none', // Do not add neighbor files.
	OpenTabs = 'opentabs', // Add open files.
	CursorMostRecent = 'cursormostrecent', // Add the most recent cursor focused files.
	CursorMostCount = 'cursormostcount', // Add the most cursor focused files.
	WorkspaceSharingSameFolder = 'workspacesharingsamefolder', // Add the workspace files sharing the same folder with the target file.
	WorkspaceSmallestPathDist = 'workspacesmallestpathdist', // Add the workspace files according to their path distance toward the target file
	OpenTabsAndCocommitted = 'opentabsandcocommitted', // Add open files and the co-committed files.
	RelatedCSharp = 'related/csharp', // The Semantic Code Context says this file is related.
	RelatedCSharpRoslyn = 'related/csharproslyn', // The C# language service says this file is related.
	RelatedCpp = 'related/cpp', // The C++ language service says this file is related.
	RelatedTypeScript = 'related/typescript', // The Typescript language service says this file is related.
	RelatedCppSemanticCodeContext = 'related/cppsemanticcodecontext', // The Semantic Code Context says this file is related.
	RelatedOther = 'related/other', // An unknown language service says this file is related.
}

/**
 * We found out that considering
 * all **open** neighbor files (independent of the language) was not helpful. However, some
 * specific languages (e.g. frontend frameworks) benefit from this approach. Leaving this
 * function here for future reference, in case we want to experiment this approach again for
 * specific languages that always use cross-language files.
 *
 * @param languageId Language ID of the current file
 * @param neighborLanguageId Language ID of the neighbor file
 * @returns Boolean value indicating whether the neighbor file should be considered
 *          (currently matching the current file's language with neighbors')
 */
export function considerNeighborFile(languageId: string, neighborLanguageId: string): boolean {
	return normalizeLanguageId(languageId) === normalizeLanguageId(neighborLanguageId);
}

export type NeighborsCollection = Map<string, SimilarFileInfo>;

export interface INeighborSource {
	getNeighborFiles(
		uri: string,
		languageId: string,
		maxNumNeighborFiles: number
	): Promise<{ docs: NeighborsCollection; neighborSource: Map<NeighboringFileType, string[]> }>;
}

export class NeighborSource {
	// Limit the amount of neighbor data to pass to promptlib.
	static MAX_NEIGHBOR_AGGREGATE_LENGTH = 200000;
	static MAX_NEIGHBOR_FILES = 20;

	static EXCLUDED_NEIGHBORS = ['node_modules', 'dist', 'site-packages'];

	static defaultEmptyResult() {
		return {
			docs: new Map<string, SimilarFileInfo>(),
			neighborSource: new Map<NeighboringFileType, string[]>(),
			traits: [] as RelatedFileTrait[],
		};
	}

	private static instance: INeighborSource | undefined;

	/** Reset the singleton instance for unit test only */
	static reset(): void {
		NeighborSource.instance = undefined;
	}

	static async getNeighborFilesAndTraits(
		accessor: ServicesAccessor,
		uri: string,
		fileType: string,
		telemetryData: TelemetryWithExp,
		cancellationToken?: ICancellationToken,
		data?: unknown,
		forceRelatedFilesComputation?: boolean
	): Promise<{
		docs: NeighborsCollection;
		neighborSource: Map<NeighboringFileType, string[]>;
		traits: RelatedFileTrait[];
	}> {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		const logTarget = accessor.get(ICompletionsLogTargetService);
		const instantiationService = accessor.get(IInstantiationService);
		const docManager = accessor.get(ICompletionsTextDocumentManagerService);
		if (NeighborSource.instance === undefined) {
			NeighborSource.instance = instantiationService.createInstance(OpenTabFiles);
		}

		const result = {
			...(await NeighborSource.instance.getNeighborFiles(uri, fileType, NeighborSource.MAX_NEIGHBOR_FILES)),
			traits: [] as RelatedFileTrait[],
		};

		if (featuresService.excludeRelatedFiles(fileType, telemetryData)) { return result; }

		const doc = await docManager.getTextDocument({ uri });
		if (!doc) {
			relatedFilesLogger.debug(logTarget,
				'neighborFiles.getNeighborFilesAndTraits',
				`Failed to get the related files: failed to get the document ${uri}`
			);
			return result;
		}

		const wksFolder = docManager.getWorkspaceFolder(doc);
		if (!wksFolder) {
			relatedFilesLogger.debug(logTarget,
				'neighborFiles.getNeighborFilesAndTraits',
				`Failed to get the related files: ${uri} is not under the workspace folder`
			);
			return result;
		}

		const relatedFiles = await instantiationService.invokeFunction(getRelatedFilesAndTraits,
			doc,
			telemetryData,
			cancellationToken,
			data,
			forceRelatedFilesComputation
		);

		if (relatedFiles.entries.size === 0) {
			relatedFilesLogger.debug(logTarget,
				'neighborFiles.getNeighborFilesAndTraits',
				`0 related files found for ${uri}`
			);
			// make sure we include traits if there's any
			result.traits.push(...relatedFiles.traits);
			return result;
		}

		relatedFiles.entries.forEach((uriToContentMap, type) => {
			const addedDocs: SimilarFileInfo[] = [];
			uriToContentMap.forEach((source, uri) => {
				const relativePath = NeighborSource.getRelativePath(uri, wksFolder.uri);
				if (!relativePath) { return; }
				// Check that results.docs does not already contain an entry for the given uri.
				if (result.docs.has(uri)) { return; }
				const relatedFileDocInfo: SimilarFileInfo = { relativePath, uri, source };
				addedDocs.unshift(relatedFileDocInfo);
				result.docs.set(uri, relatedFileDocInfo);
			});

			if (addedDocs.length > 0) {
				result.neighborSource.set(
					type,
					addedDocs.map(doc => doc.uri.toString())
				);
			}
		});
		result.traits.push(...relatedFiles.traits);

		return result;
	}

	static basename(uri: string): string {
		return decodeURIComponent(uri.replace(/[#?].*$/, '').replace(/^.*[/:]/, ''));
	}

	/**
	 * Get the fileUri relative to the provided basePath
	 * or its basename if basePath is not its ancestor.
	 */
	static getRelativePath(fileUri: string, baseUri: string): string | undefined {
		const parentURI = baseUri
			.toString()
			.replace(/[#?].*/, '')
			.replace(/\/?$/, '/');
		if (fileUri.toString().startsWith(parentURI)) {
			return fileUri.toString().slice(parentURI.length);
		}
		return NeighborSource.basename(fileUri);
	}
}

export function isIncludeNeighborFilesActive(accessor: ServicesAccessor, languageId: string, telemetryData: TelemetryWithExp): boolean {
	const featuresService = accessor.get(ICompletionsFeaturesService);
	return featuresService.includeNeighboringFiles(languageId, telemetryData);
}