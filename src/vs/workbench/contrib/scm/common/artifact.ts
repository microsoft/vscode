/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ISCMRepository } from './scm.js';

export interface ISCMArtifactProvider {
	readonly onDidChangeArtifacts: Event<string[]>;
	provideArtifactGroups(): Promise<ISCMArtifactGroup[] | undefined>;
	provideArtifacts(group: string): Promise<ISCMArtifact[] | undefined>;
}

export interface ISCMArtifactGroup {
	readonly id: string;
	readonly name: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
}

export interface ISCMArtifact {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly icon?: URI | { light: URI; dark: URI } | ThemeIcon;
}

export interface SCMArtifactGroupTreeElement {
	readonly repository: ISCMRepository;
	readonly artifactGroup: ISCMArtifactGroup;
	readonly type: 'artifactGroup';
}

export interface SCMArtifactTreeElement {
	readonly repository: ISCMRepository;
	readonly group: ISCMArtifactGroup;
	readonly artifact: ISCMArtifact;
	readonly type: 'artifact';
}
