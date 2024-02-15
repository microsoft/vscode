/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { autorunWithStore } from 'vs/base/common/observable';
import { PlaygroundWidget } from 'vs/editor/browser/playgroundDemo/impl';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';

const d = h('div', {}, []);

d.root.style.position = 'absolute';
d.root.style.top = '100px';
d.root.style.left = '100px';
d.root.style.width = '80%';
d.root.style.height = '80%';
d.root.style.backgroundColor = 'white';
d.root.style.border = '1px solid black';
d.root.style.zIndex = '10000';
d.root.style.fontSize = '20px';
d.root.style.padding = '10px';

window.document.body.appendChild(d.root);

autorunWithStore((reader, store) => {
	store.add(new (readHotReloadableExport(PlaygroundWidget, reader))(d.root));
});
