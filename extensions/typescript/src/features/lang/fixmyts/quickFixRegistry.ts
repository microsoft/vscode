/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import {QuickFix} from './quickFix';
/**
 * This exists to register the quick fixes
 */
import {AddClassMember} from './quickFixes/addClassMember';
import {AddClassMethod} from './quickFixes/addClassMethod';
import {AddImportFromStatement} from './quickFixes/addImportFromStatement';
import {AddImportStatement} from './quickFixes/addImportStatement';
import {TypeAssertPropertyAccessToAny} from './quickFixes/typeAssertPropertyAccessToAny';
import {ImplementInterface} from './quickFixes/implementInterface';
import {ImplementAbstractClass} from './quickFixes/implementAbstractClass';

export var allQuickFixes: QuickFix[] = [
	new AddClassMethod(),
	new AddClassMember(),
	new AddImportFromStatement(),
	new AddImportStatement(),
	new TypeAssertPropertyAccessToAny(),
	new ImplementInterface(),
	new ImplementAbstractClass()
];
