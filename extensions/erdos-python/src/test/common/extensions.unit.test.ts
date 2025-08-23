import { assert, expect } from 'chai';
import '../../client/common/extensions';
import { asyncFilter } from '../../client/common/utils/arrayUtils';

// Defines a Mocha test suite to group tests of similar kind together
suite('String Extensions', () => {
    test('Should return empty string for empty arg', () => {
        const argTotest = '';
        expect(argTotest.toCommandArgumentForPythonExt()).to.be.equal('');
    });
    test('Should quote an empty space', () => {
        const argTotest = ' ';
        expect(argTotest.toCommandArgumentForPythonExt()).to.be.equal('" "');
    });
    test('Should not quote command arguments without spaces', () => {
        const argTotest = 'one.two.three';
        expect(argTotest.toCommandArgumentForPythonExt()).to.be.equal(argTotest);
    });
    test('Should quote command arguments with spaces', () => {
        const argTotest = 'one two three';
        expect(argTotest.toCommandArgumentForPythonExt()).to.be.equal(`"${argTotest}"`);
    });
    test('Should quote file paths containing one of the parentheses: ( ', () => {
        const fileToTest = 'user/code(1.py';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest}"`);
    });

    test('Should quote file paths containing one of the parentheses: ) ', () => {
        const fileToTest = 'user)/code1.py';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest}"`);
    });

    test('Should quote file paths containing both of the parentheses: () ', () => {
        const fileToTest = '(user)/code1.py';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest}"`);
    });

    test('Should quote command arguments containing ampersand', () => {
        const argTotest = 'one&twothree';
        expect(argTotest.toCommandArgumentForPythonExt()).to.be.equal(`"${argTotest}"`);
    });
    test('Should return empty string for empty path', () => {
        const fileToTest = '';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal('');
    });
    test('Should not quote file argument without spaces', () => {
        const fileToTest = 'users/test/one';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(fileToTest);
    });
    test('Should quote file argument with spaces', () => {
        const fileToTest = 'one two three';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest}"`);
    });
    test('Should replace all back slashes with forward slashes (irrespective of OS)', () => {
        const fileToTest = 'c:\\users\\user\\conda\\scripts\\python.exe';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(fileToTest.replace(/\\/g, '/'));
    });
    test('Should replace all back slashes with forward slashes (irrespective of OS) and quoted when file has spaces', () => {
        const fileToTest = 'c:\\users\\user namne\\conda path\\scripts\\python.exe';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest.replace(/\\/g, '/')}"`);
    });
    test('Should replace all back slashes with forward slashes (irrespective of OS) and quoted when file has spaces', () => {
        const fileToTest = 'c:\\users\\user namne\\conda path\\scripts\\python.exe';
        expect(fileToTest.fileToCommandArgumentForPythonExt()).to.be.equal(`"${fileToTest.replace(/\\/g, '/')}"`);
    });
    test('Should leave string unchanged', () => {
        expect('something {0}'.format()).to.be.equal('something {0}');
    });
    test('String should be formatted to contain first argument', () => {
        const formatString = 'something {0}';
        const expectedString = 'something one';
        expect(formatString.format('one')).to.be.equal(expectedString);
    });
    test('String should be formatted to contain first argument even with too many args', () => {
        const formatString = 'something {0}';
        const expectedString = 'something one';
        expect(formatString.format('one', 'two')).to.be.equal(expectedString);
    });
    test('String should be formatted to contain second argument', () => {
        const formatString = 'something {1}';
        const expectedString = 'something two';
        expect(formatString.format('one', 'two')).to.be.equal(expectedString);
    });
    test('String should be formatted to contain second argument even with too many args', () => {
        const formatString = 'something {1}';
        const expectedString = 'something two';
        expect(formatString.format('one', 'two', 'three')).to.be.equal(expectedString);
    });
    test('String should be formatted with multiple args', () => {
        const formatString = 'something {1}, {0}';
        const expectedString = 'something two, one';
        expect(formatString.format('one', 'two', 'three')).to.be.equal(expectedString);
    });
    test('String should remove quotes', () => {
        const quotedString = `'foo is "bar" is foo' is bar'`;
        const quotedString2 = `foo is "bar" is foo' is bar'`;
        const quotedString3 = `foo is "bar" is foo' is bar`;
        const quotedString4 = `"foo is "bar" is foo' is bar"`;
        const expectedString = `foo is "bar" is foo' is bar`;
        expect(quotedString.trimQuotes()).to.be.equal(expectedString);
        expect(quotedString2.trimQuotes()).to.be.equal(expectedString);
        expect(quotedString3.trimQuotes()).to.be.equal(expectedString);
        expect(quotedString4.trimQuotes()).to.be.equal(expectedString);
    });
});

suite('Array extensions', () => {
    test('Async filter should filter items', async () => {
        const stringArray = ['Hello', 'I', 'am', 'the', 'Python', 'extension'];
        const result = await asyncFilter(stringArray, async (s: string) => {
            return s.length > 4;
        });
        assert.deepEqual(result, ['Hello', 'Python', 'extension']);
    });
});
