import { toPascalCase } from './pascalCase';
import * as assert from 'assert';

// Basic test
assert.strictEqual(toPascalCase('FOO_BAR'), 'FooBar');

// Double underscores
assert.strictEqual(toPascalCase('FOO__BAR'), 'FooBar');

// Leading underscore
assert.strictEqual(toPascalCase('_LEADING'), 'Leading');

// Trailing underscore
assert.strictEqual(toPascalCase('TRAILING_'), 'Trailing');

// Acronyms
assert.strictEqual(toPascalCase('HTML_API_VERSION'), 'HtmlApiVersion');

console.log('All PascalCase tests passed!');
