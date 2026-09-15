/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { chartsBlue, chartsPurple, descriptionForeground, editorBackground, opaque, registerColor } from '../../../../platform/theme/common/colorRegistry.js';

registerColor('semanticDiff.logicForeground', chartsPurple,
	localize('semanticDiff.logicForeground', "Color of Logic change-type badges and gutter markers in the semantic diff editor."));

registerColor('semanticDiff.testForeground',
	{ dark: '#56B6C2', light: '#006D77', hcDark: '#6BD5DD', hcLight: '#005C65' },
	localize('semanticDiff.testForeground', "Color of Test change-type badges and gutter markers in the semantic diff editor."));

registerColor('semanticDiff.supportingForeground',
	{ dark: '#C49A6C', light: '#855C33', hcDark: '#DDB78D', hcLight: '#6B431F' },
	localize('semanticDiff.supportingForeground', "Color of Supporting change-type badges and gutter markers in the semantic diff editor."));

registerColor('semanticDiff.generatedForeground', chartsBlue,
	localize('semanticDiff.generatedForeground', "Color of Generated change-type badges and gutter markers in the semantic diff editor."));

registerColor('semanticDiff.unclassifiedForeground', opaque(descriptionForeground, editorBackground),
	localize('semanticDiff.unclassifiedForeground', "Color of Unclassified change-type badges and gutter markers in the semantic diff editor."));
