/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { IPathService } from '../../services/path/common/pathService.js';

export const pathUriToLabel = (path: URI, labelService: ILabelService): string => {
	return labelService.getUriLabel(path, { noPrefix: true });
};

export const combineLabelWithPathUri = async (
	label: string,
	uri: URI,
	pathService: IPathService
): Promise<URI> => {
	let labelUpdated = label.trim();

	if (labelUpdated === '') {
		return uri.with({ path: '' });
	}

	if (!labelUpdated.startsWith('/')) {
		labelUpdated = '/' + labelUpdated;
	}

	const pathLib = await pathService.path;

	let includeTrailingSlash = false;
	if (labelUpdated.endsWith('/') || labelUpdated.endsWith('\\')) {
		includeTrailingSlash = true;
	}

	labelUpdated = pathLib.format(pathLib.parse(labelUpdated));
	if (includeTrailingSlash) {
		labelUpdated += pathLib.sep;
	}

	return uri.with({ path: labelUpdated });
};
