/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { outdent } from 'outdent';
import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, snapshotPathInFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - cpp', () => {
	afterAll(() => _dispose());

	function cppStruct(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.Cpp, source);
	}

	test('source with different syntax constructs', async () => {

		const filename = 'test.cpp';

		const source = await fromFixture(filename);

		await expect(await cppStruct(source)).toMatchFileSnapshot(snapshotPathInFixture(filename));
	});

	test('do not throw invalid range error', async () => {

		const filename = 'problem1.cpp';

		const source = await fromFixture(filename);

		await expect(await cppStruct(source)).toMatchFileSnapshot(snapshotPathInFixture(filename));
	});

	test('do not throw invalid range error - 2', async () => {
		const source = outdent`
			void main() {
				// Trigger servo movement based on the difference
				if (remappedDifference > 0) {
					Serial.println("Turning clockwise...");
					controlServo(SERVO_CW); // Spin the servo clockwise
				} else if (remappedDifference < 0) {
					Serial.println("Turning counterclockwise...");
					controlServo(SERVO_CCW); // Spin the servo counterclockwise
				} /* else {
					Serial.println("Stopping servo...");
					controlServo(SERVO_STOP); // Stop the servo if the difference is zero
				} */
			}
		`;

		expect(await cppStruct(source)).toMatchInlineSnapshot(`
			"<FUNCTION_DEFINITION>void main() {
			<COMMENT>	// Trigger servo movement based on the difference
			</COMMENT><IF_STATEMENT>	if (remappedDifference > 0) {
			<EXPRESSION_STATEMENT>		Serial.println("Turning clockwise...");
			</EXPRESSION_STATEMENT><EXPRESSION_STATEMENT-1>		controlServo(SERVO_CW); // Spin the servo clockwise
			</EXPRESSION_STATEMENT-1>	} else<IF_STATEMENT-1> if (remappedDifference < 0) {
			<EXPRESSION_STATEMENT-2>		Serial.println("Turning counterclockwise...");
			</EXPRESSION_STATEMENT-2><EXPRESSION_STATEMENT-3>		controlServo(SERVO_CCW); // Spin the servo counterclockwise
			</EXPRESSION_STATEMENT-3>	}</IF_STATEMENT-1> /* else {
					Serial.println("Stopping servo...");
					controlServo(SERVO_STOP); // Stop the servo if the difference is zero
				} */
			</IF_STATEMENT>}</FUNCTION_DEFINITION>"
		`);
	});

	test('trailing semicolon after class declaration', async () => {
		const source = `class A {};`;

		expect(await cppStruct(source)).toMatchInlineSnapshot(`"<CLASS_SPECIFIER>class A {};</CLASS_SPECIFIER>"`);
	});
});
