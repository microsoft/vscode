/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../common/cancellation.js';
import { TfIdfCalculator } from '../../common/tfIdf.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
/**
 * Generates all permutations of an array.
 *
 * This is useful for testing to make sure order does not effect the result.
 */
function permutate(arr) {
    if (arr.length === 0) {
        return [[]];
    }
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const permutationsRest = permutate(rest);
        for (let j = 0; j < permutationsRest.length; j++) {
            result.push([arr[i], ...permutationsRest[j]]);
        }
    }
    return result;
}
function assertScoreOrdersEqual(actualScores, expectedScoreKeys) {
    actualScores.sort((a, b) => (b.score - a.score) || a.key.localeCompare(b.key));
    assert.strictEqual(actualScores.length, expectedScoreKeys.length);
    for (let i = 0; i < expectedScoreKeys.length; i++) {
        assert.strictEqual(actualScores[i].key, expectedScoreKeys[i]);
    }
}
suite('TF-IDF Calculator', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Should return no scores when no documents are given', () => {
        const tfidf = new TfIdfCalculator();
        const scores = tfidf.calculateScores('something', CancellationToken.None);
        assertScoreOrdersEqual(scores, []);
    });
    test('Should return no scores for term not in document', () => {
        const tfidf = new TfIdfCalculator().updateDocuments([
            makeDocument('A', 'cat dog fish'),
        ]);
        const scores = tfidf.calculateScores('elepant', CancellationToken.None);
        assertScoreOrdersEqual(scores, []);
    });
    test('Should return scores for document with exact match', () => {
        for (const docs of permutate([
            makeDocument('A', 'cat dog cat'),
            makeDocument('B', 'cat fish'),
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('dog', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['A']);
        }
    });
    test('Should return document with more matches first', () => {
        for (const docs of permutate([
            makeDocument('/A', 'cat dog cat'),
            makeDocument('/B', 'cat fish'),
            makeDocument('/C', 'frog'),
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('cat', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/B']);
        }
    });
    test('Should return document with more matches first when term appears in all documents', () => {
        for (const docs of permutate([
            makeDocument('/A', 'cat dog cat cat'),
            makeDocument('/B', 'cat fish'),
            makeDocument('/C', 'frog cat cat'),
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('cat', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/C', '/B']);
        }
    });
    test('Should weigh less common term higher', () => {
        for (const docs of permutate([
            makeDocument('/A', 'cat dog cat'),
            makeDocument('/B', 'fish'),
            makeDocument('/C', 'cat cat cat cat'),
            makeDocument('/D', 'cat fish')
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('cat the dog', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/C', '/D']);
        }
    });
    test('Should weigh chunks with less common terms higher', () => {
        for (const docs of permutate([
            makeDocument('/A', ['cat dog cat', 'fish']),
            makeDocument('/B', ['cat cat cat cat dog', 'dog'])
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('cat', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/B', '/A']);
        }
        for (const docs of permutate([
            makeDocument('/A', ['cat dog cat', 'fish']),
            makeDocument('/B', ['cat cat cat cat dog', 'dog'])
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('dog', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/B', '/B']);
        }
        for (const docs of permutate([
            makeDocument('/A', ['cat dog cat', 'fish']),
            makeDocument('/B', ['cat cat cat cat dog', 'dog'])
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('cat the dog', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/B', '/A', '/B']);
        }
        for (const docs of permutate([
            makeDocument('/A', ['cat dog cat', 'fish']),
            makeDocument('/B', ['cat cat cat cat dog', 'dog'])
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('lake fish', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A']);
        }
    });
    test('Should ignore case and punctuation', () => {
        for (const docs of permutate([
            makeDocument('/A', 'Cat doG.cat'),
            makeDocument('/B', 'cAt fiSH'),
            makeDocument('/C', 'frOg'),
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('. ,CaT!  ', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/B']);
        }
    });
    test('Should match on camelCase words', () => {
        for (const docs of permutate([
            makeDocument('/A', 'catDog cat'),
            makeDocument('/B', 'fishCatFish'),
            makeDocument('/C', 'frogcat'),
        ])) {
            const tfidf = new TfIdfCalculator().updateDocuments(docs);
            const scores = tfidf.calculateScores('catDOG', CancellationToken.None);
            assertScoreOrdersEqual(scores, ['/A', '/B']);
        }
    });
    test('Should not match document after delete', () => {
        const docA = makeDocument('/A', 'cat dog cat');
        const docB = makeDocument('/B', 'cat fish');
        const docC = makeDocument('/C', 'frog');
        const tfidf = new TfIdfCalculator().updateDocuments([docA, docB, docC]);
        let scores = tfidf.calculateScores('cat', CancellationToken.None);
        assertScoreOrdersEqual(scores, ['/A', '/B']);
        tfidf.deleteDocument(docA.key);
        scores = tfidf.calculateScores('cat', CancellationToken.None);
        assertScoreOrdersEqual(scores, ['/B']);
        tfidf.deleteDocument(docC.key);
        scores = tfidf.calculateScores('cat', CancellationToken.None);
        assertScoreOrdersEqual(scores, ['/B']);
        tfidf.deleteDocument(docB.key);
        scores = tfidf.calculateScores('cat', CancellationToken.None);
        assertScoreOrdersEqual(scores, []);
    });
});
function makeDocument(key, content) {
    return {
        key,
        textChunks: Array.isArray(content) ? content : [content],
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGZJZGYudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24vdGZJZGYudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBNkIsTUFBTSx1QkFBdUIsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckU7Ozs7R0FJRztBQUNILFNBQVMsU0FBUyxDQUFJLEdBQVE7SUFDN0IsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNLE1BQU0sR0FBVSxFQUFFLENBQUM7SUFFekIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNyQyxNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxF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