/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface NLSConfiguration {
	locale: string;
	availableLanguages: {
		[key: string]: string;
	};
	pseudo?: boolean;
}

export function getNLSConfiguration(commit: string, userDataPath: string, metaDataFile: string, locale: string): Promise<NLSConfiguration>;