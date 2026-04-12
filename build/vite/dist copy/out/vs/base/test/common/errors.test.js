/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { toErrorMessage } from '../../common/errorMessage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { transformErrorForSerialization, transformErrorFromSerialization } from '../../common/errors.js';
import { assertType } from '../../common/types.js';
suite('Errors', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Get Error Message', function () {
        assert.strictEqual(toErrorMessage('Foo Bar'), 'Foo Bar');
        assert.strictEqual(toErrorMessage(new Error('Foo Bar')), 'Foo Bar');
        let error = new Error();
        error = new Error();
        error.detail = {};
        error.detail.exception = {};
        error.detail.exception.message = 'Foo Bar';
        assert.strictEqual(toErrorMessage(error), 'Foo Bar');
        assert.strictEqual(toErrorMessage(error, true), 'Foo Bar');
        assert(toErrorMessage());
        assert(toErrorMessage(null));
        assert(toErrorMessage({}));
        try {
            throw new Error();
        }
        catch (error) {
            assert.strictEqual(toErrorMessage(error), 'An unknown error occurred. Please consult the log for more details.');
            assert.ok(toErrorMessage(error, true).length > 'An unknown error occurred. Please consult the log for more details.'.length);
        }
    });
    test('Transform Error for Serialization', function () {
        const error = new Error('Test error');
        const serializedError = transformErrorForSerialization(error);
        assert.strictEqual(serializedError.name, 'Error');
        assert.strictEqual(serializedError.message, 'Test error');
        assert.strictEqual(serializedError.stack, error.stack);
        assert.strictEqual(serializedError.noTelemetry, false);
        assert.strictEqual(serializedError.cause, undefined);
    });
    test('Transform Error with Cause for Serialization', function () {
        const cause = new Error('Cause error');
        const error = new Error('Test error', { cause });
        const serializedError = transformErrorForSerialization(error);
        assert.strictEqual(serializedError.name, 'Error');
        assert.strictEqual(serializedError.message, 'Test error');
        assert.strictEqual(serializedError.stack, error.stack);
        assert.strictEqual(serializedError.noTelemetry, false);
        assert.ok(serializedError.cause);
        assert.strictEqual(serializedError.cause?.name, 'Error');
        assert.strictEqual(serializedError.cause?.message, 'Cause error');
        assert.strictEqual(serializedError.cause?.stack, cause.stack);
    });
    test('Transform Error from Serialization', function () {
        const serializedError = transformErrorForSerialization(new Error('Test error'));
        const error = transformErrorFromSerialization(serializedError);
        assert.strictEqual(error.name, 'Error');
        assert.strictEqual(error.message, 'Test error');
        assert.strictEqual(error.stack, serializedError.stack);
        assert.strictEqual(error.cause, undefined);
    });
    test('Transform Error with Cause from Serialization', function () {
        const cause = new Error('Cause error');
        const serializedCause = transformErrorForSerialization(cause);
        const error = new Error('Test error', { cause });
        const serializedError = transformErrorForSerialization(error);
        const deserializedError = transformErrorFromSerialization(serializedError);
        assert.strictEqual(deserializedError.name, 'Error');
        assert.strictEqual(deserializedError.message, 'Test error');
        assert.strictEqual(deserializedError.stack, serializedError.stack);
        assert.ok(deserializedError.cause);
        assertType(deserializedError.cause instanceof Error);
        assert.strictEqual(deserializedError.cause?.name, 'Error');
        assert.strictEqual(deserializedError.cause?.message, 'Cause error');
        assert.strictEqual(deserializedError.cause?.stack, serializedCause.stack);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2Vycm9ycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ3JFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3pHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVuRCxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtJQUNwQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtRQUN6QixNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXBFLElBQUksS0FBSyxHQUFRLElBQUksS0FBSyxFQUFFLENBQUM7UUFDN0IsS0FBSyxHQUFHLElBQUksS0FBSyxFQUFFLENBQUM7UUFDcEIsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDbEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQzVCLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sR0FBRyxTQUFTLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLEVBQUUs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