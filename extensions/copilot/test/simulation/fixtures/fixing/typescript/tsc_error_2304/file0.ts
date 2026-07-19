// here's a copyright

import { parse } from './file1';
import * as assert from 'assert';

declare function test(name: string, callback: () => void): void;

// here are some comments that should be preserved

test('parse', () => {
	const testObj = parse(readFileSync('myFile.txt', 'utf-8'));
	assert.equal(testObj.a, 1);
});
