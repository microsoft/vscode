/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {registerMode} from 'vs/editor/common/modes/modesRegistry';
import platform = require('vs/platform/platform');
import {OutputService} from 'vs/workbench/parts/output/common/outputServices';
import {OUTPUT_MIME, OUTPUT_MODE_ID, OUTPUT_PANEL_ID, IOutputService} from 'vs/workbench/parts/output/common/output';
import panel = require('vs/workbench/browser/panel');
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Mode
registerMode({
	id: OUTPUT_MODE_ID,
	extensions: [],
	aliases: [null],
	mimetypes: [OUTPUT_MIME],
	moduleId: 'vs/workbench/parts/output/common/outputMode',
	ctorName: 'OutputMode'
});

// Register Output Panel
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/output/browser/outputPanel',
	'OutputPanel',
	OUTPUT_PANEL_ID,
	nls.localize('output', "Output"),
	'output',
	40
));
