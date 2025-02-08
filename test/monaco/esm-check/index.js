/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-no-standalone-editor
import * as monaco from './out/vs/editor/editor.main.js';

monaco.editor.create(document.getElementById('container'), {
	value: 'Hello world'
});
