/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createValidator } from 'vs/workbench/services/preferences/common/preferencesModels';
import { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';


suite('Preferences Model test', () => {


	class Tester {
		private validator: (value: any) => string;

		constructor(settings: IConfigurationPropertySchema) {
			this.validator = createValidator(settings);
		}

		public accepts(input) {
			assert(this.validator(input) === '');
		}

		public rejects(input) {
			assert(this.validator(input) !== '');
		}

		public acceptsEmpty() {
			this.accepts('');
		}

		public rejectsEmpty() {
			this.rejects('');
		}

		public validatesNumeric() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.rejects('3f');
		}

		public validatesNullableNumeric() {
			this.validatesNumeric();
			this.acceptsEmpty();
		}

		public validatesNonNullableNumeric() {
			this.validatesNumeric();
			this.rejectsEmpty();
		}

		public validatesString() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.accepts('');
			this.accepts('3f');
			this.accepts('hello');
		}
	}


	test('exclusive max and max work together properly', () => {
		{
			const justMax = new Tester({ maximum: 5, type: 'number' });
			justMax.validatesNonNullableNumeric();
			justMax.rejects('5.1');
			justMax.accepts('5.0');
		}
		{
			const justEMax = new Tester({ exclusiveMaximum: 5, type: 'number' });
			justEMax.validatesNonNullableNumeric();
			justEMax.rejects('5.1');
			justEMax.rejects('5.0');
			justEMax.accepts('4.999');
		}
		{
			const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 4, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('5.1');
			bothNumeric.rejects('5.0');
			bothNumeric.rejects('4.999');
			bothNumeric.accepts('4');
		}
		{
			const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 6, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('5.1');
			bothNumeric.rejects('5.0');
			bothNumeric.accepts('4.999');
		}
	});

	test('exclusive min and min work together properly', () => {

	});
});