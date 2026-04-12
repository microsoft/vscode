/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ok, assert as commonAssert } from '../../common/assert.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { CancellationError, ReadonlyError } from '../../common/errors.js';
suite('Assert', () => {
    test('ok', () => {
        assert.throws(function () {
            ok(false);
        });
        assert.throws(function () {
            ok(null);
        });
        assert.throws(function () {
            ok();
        });
        assert.throws(function () {
            ok(null, 'Foo Bar');
        }, function (e) {
            return e.message.indexOf('Foo Bar') >= 0;
        });
        ok(true);
        ok('foo');
        ok({});
        ok(5);
    });
    suite('throws a provided error object', () => {
        test('generic error', () => {
            const originalError = new Error('Oh no!');
            try {
                commonAssert(false, originalError);
            }
            catch (thrownError) {
                assert.strictEqual(thrownError, originalError, 'Must throw the provided error instance.');
                assert.strictEqual(thrownError.message, 'Oh no!', 'Must throw the provided error instance.');
            }
        });
        test('cancellation error', () => {
            const originalError = new CancellationError();
            try {
                commonAssert(false, originalError);
            }
            catch (thrownError) {
                assert.strictEqual(thrownError, originalError, 'Must throw the provided error instance.');
            }
        });
        test('readonly error', () => {
            const originalError = new ReadonlyError('World');
            try {
                commonAssert(false, originalError);
            }
            catch (thrownError) {
                assert.strictEqual(thrownError, originalError, 'Must throw the provided error instance.');
                assert.strictEqual(thrownError.message, 'World is read-only and cannot be changed', 'Must throw the provided error instance.');
            }
        });
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXJ0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL2Fzc2VydC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsRUFBRSxFQUFFLE1BQU0sSUFBSSxZQUFZLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDckUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO0lBQ3BCLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNiLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNYLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNiLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNiLEVBQUUsRUFBRSxDQUFDO1FBQ04sQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsTUFBTSxDQUFDO1lBQ2IsRUFBRSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNyQixDQUFDLEVBQUUsVUFBVSxDQUFRO1lBQ3BCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFDLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ1QsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ1YsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ1AsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO1FBQzVDLElBQUksQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFO1lBQzFCLE1BQU0sYUFBYSxHQUFHLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTFDLElBQUksQ0FBQztnQkFDSixZQUFZLENBQ1gsS0FBSyxFQUNMLGFBQWEsQ0FDYixDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sV0FBVyxFQUFFLENBQUM7Z0JBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLFdBQVcsRUFDWCxhQUFhLEVBQ2IseUNBQXlDLENBQ3pDLENBQUM7Z0JBRUYsTUFBTSxDQUFDLFdBQVcsQ0FDakIsV0FBVyxDQUFDLE9BQU8sRUFDbkIsUUFBUSxFQUNSLHlDQUF5QyxDQUN6QyxDQUFDO1lBQ0gsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtZQUMvQixNQUFNLGFBQWEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7WUFFOUMsSUFBSSxDQUFDO2dCQUNKLFlBQVksQ0FDWCxLQUFLLEVBQ0wsYUFBYSxDQUNiLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxXQUFXLEVBQUUsQ0FBQztnQkFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FDakIsV0FBVyxFQUNYLGFBQWEsRUFDYix5Q0FBeUMsQ0FDekMsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7WUFDM0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFakQsSUFBSSxDQUFDO2dCQUNKLFlBQVksQ0FDWCxLQUFLLEVBQ0wsYUFBYSxDQUNiLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxXQUFXLEVBQUUsQ0FBQztnQkFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FDakIsV0FBVyxFQUNYLGFBQWEsRUFDYix5Q0FBeUMsQ0FDekMsQ0FBQztnQkFFRixNQUFNLENBQUMsV0FBVyxDQUNqQixXQUFXLENBQUMsT0FBTyxFQUNuQiwwQ0FBMEMsRUFDMUMseUNBQXlDLENBQ3pDLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QyxFQUFFLENBQUM7QUFDM0MsQ0FBQyxDQUFDLENBQUMifQ==