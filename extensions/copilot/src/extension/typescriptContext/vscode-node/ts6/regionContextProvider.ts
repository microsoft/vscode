/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { IRegionContextProviderService, Region, LineRange } from '../../../../platform/languageContextProvider/common/regionContextProvider';
import * as protocol from '../../common/serverProtocol';

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly executionTarget?: ExecutionTarget;
};

type RegionContextRequestArgs = Omit<protocol.RegionContextRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

export class TS6RegionContextProvider implements Omit<IRegionContextProviderService, '_serviceBrand'>, vscode.Disposable {
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	async getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		if (document.scheme !== 'file' || (languageId !== 'typescript' && languageId !== 'javascript')) {
			return undefined;
		}
		if (ranges.length === 0) {
			return undefined;
		}

		const firstPosition = ranges[0].start;
		const args: RegionContextRequestArgs = {
			file: document,
			line: firstPosition.line + 1,
			offset: firstPosition.character + 1,
			ranges: ranges.map(range => ({
				start: { line: range.start.line, character: range.start.character },
				end: { line: range.end.line, character: range.end.character }
			})),
			requested
		};
		const response = await vscode.commands.executeCommand<protocol.RegionContextResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.regionContext',
			args,
			TS6RegionContextProvider.ExecConfig
		);
		return protocol.RegionContextResponse.isOk(response) && response.body.regions.length > 0 ? response.body.regions : undefined;
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation
	}
}
