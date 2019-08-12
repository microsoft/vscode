///
/* tslint:disable */
const x01 = "string";
///         ^^^^^^^^ string

const x02 = '\'';
///         ^^^^ string

const x03 = '\n\'\t';
///         ^^^^^^^^ string

const x04 = 'this is\
///         ^^^^^^^^^ string\
a multiline string';
/// <------------------- string

const x05 = x01;// just some text
///             ^^^^^^^^^^^^^^^^^ comment

const x06 = x05;/* multi
///             ^^^^^^^^ comment
line *comment */
/// <---------------- comment

const x07 = 4 / 5;

const x08 = `howdy`;
///         ^^^^^^^ string

const x09 = `\'\"\``;
///         ^^^^^^^^ string

const x10 = `$[]`;
///         ^^^^^ string

const x11 = `${x07 +/**/3}px`;
///         ^^^ string
///                 ^^^^ comment
///                      ^^^^ string

const x12 = `${x07 + (function () { return 5; })()/**/}px`;
///         ^^^ string
///                                               ^^^^ comment
///                                                   ^^^^ string

const x13 = /([\w\-]+)?(#([\w\-]+))?((.([\w\-]+))*)/;
///         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ regex

const x14 = /\./g;
///         ^^^^^ regex


const x15 = Math.abs(x07) / x07; // speed
///                              ^^^^^^^^ comment

const x16 = / x07; /.test('3');
///         ^^^^^^^^ regex
///                       ^^^ string

const x17 = `.dialog-modal-block${true ? '.dimmed' : ''}`;
///         ^^^^^^^^^^^^^^^^^^^^^^ string
///                                      ^^^^^^^^^ string
///                                                  ^^^^ string

const x18 = Math.min((14 <= 0.5 ? 123 / (2 * 1) : ''.length / (2 - (2 * 1))), 1);
///                                               ^^ string

const x19 = `${3 / '5'.length} km/h)`;
///         ^^^ string
///                ^^^ string
///                          ^^^^^^^ string
