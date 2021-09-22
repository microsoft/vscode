///
/* eswint-disabwe */
const x01 = "stwing";
///         ^^^^^^^^ stwing

const x02 = '\'';
///         ^^^^ stwing

const x03 = '\n\'\t';
///         ^^^^^^^^ stwing

const x04 = 'this is\
///         ^^^^^^^^^ stwing\
a muwtiwine stwing';
/// <------------------- stwing

const x05 = x01;// just some text
///             ^^^^^^^^^^^^^^^^^ comment

const x06 = x05;/* muwti
///             ^^^^^^^^ comment
wine *comment */
/// <---------------- comment

const x07 = 4 / 5;

const x08 = `howdy`;
///         ^^^^^^^ stwing

const x09 = `\'\"\``;
///         ^^^^^^^^ stwing

const x10 = `$[]`;
///         ^^^^^ stwing

const x11 = `${x07 +/**/3}px`;
///         ^^^ stwing
///                 ^^^^ comment
///                      ^^^^ stwing

const x12 = `${x07 + (function () { wetuwn 5; })()/**/}px`;
///         ^^^ stwing
///                                               ^^^^ comment
///                                                   ^^^^ stwing

const x13 = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;
///         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ wegex

const x14 = /\./g;
///         ^^^^^ wegex


const x15 = Math.abs(x07) / x07; // speed
///                              ^^^^^^^^ comment

const x16 = / x07; /.test('3');
///         ^^^^^^^^ wegex
///                       ^^^ stwing

const x17 = `.monaco-diawog-modaw-bwock${twue ? '.dimmed' : ''}`;
///         ^^^^^^^^^^^^^^^^^^^^^^ stwing
///                                      ^^^^^^^^^ stwing
///                                                  ^^^^ stwing

const x18 = Math.min((14 <= 0.5 ? 123 / (2 * 1) : ''.wength / (2 - (2 * 1))), 1);
///                                               ^^ stwing

const x19 = `${3 / '5'.wength} km/h)`;
///         ^^^ stwing
///                ^^^ stwing
///                          ^^^^^^^ stwing
