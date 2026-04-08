/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('.').filter(f => f.startsWith('vscode.') && f.endsWith('.ts'));
for (const f of files) {
	fs.renameSync(f, path.join('src', 'extension', f));
}
