/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('node:path');

const targetDocument = 'issue-wizard-extension-symptom.txt';
const replacement = 'Issue Wizard Known Problem extension replaced this line after save.';

function replacementForDocument(documentPath) {
	return path.basename(documentPath) === targetDocument ? replacement : undefined;
}

module.exports = { replacementForDocument };

