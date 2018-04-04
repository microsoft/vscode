/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { connect } from './driver';

const rootPath = path.dirname(path.dirname(path.dirname(__dirname)));
const outPath = path.join(rootPath, 'out');
const handlePath = path.join(rootPath, 'foo.sock');

connect(outPath, handlePath).then(({ client, driver }) => {
	return driver.getWindows().then(w => {
		console.log(w);
		client.dispose();
	});
}, err => console.error('oh no', err));