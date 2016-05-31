/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

var Messages = {
	'markers.panel.toggle.label': 'Toggle Problems',
	'markers.panel.no.problems': 'No problems',
	'markers.panel.no.problems.build': 'This workspace is clear or not yet built',
	'markers.panel.no.problems.filters': 'No problems found with given filter criteria',
	'markers.panel.no.errors': 'This workspace has no errors',
	'markers.panel.single.error.label': '{0} Error',
	'markers.panel.multiple.errors.label': '{0} Errors',
	'markers.panel.single.warning.label': '{0} Warning',
	'markers.panel.multiple.warnings.label': '{0} Warnings',
	'markers.panel.single.info.label': '{0} Info',
	'markers.panel.multiple.infos.label': '{0} Infos',
	'markers.panel.single.unknown.label': '{0} Unknown',
	'markers.panel.multiple.unknowns.label': '{0} Unknowns',
	'markers.panel.filter.placeholder': 'Type to Filter',

	getString: function(key:string, ...args: string[]): string {
		return nls.localize(key, Messages[key], args);
	}
};

export default Messages;