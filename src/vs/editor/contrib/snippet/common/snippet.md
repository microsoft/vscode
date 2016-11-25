
Tabstops
--

With tabstops you can make the editor cursor move inside a snippet. Use `$1`, `$2` to specify cursor locations. The number is the order in which tabstops will be visited, whereas `$0` denotes the final cursor position. Multiple tabstops are linked and updated in sync.

Placeholders
--

Placeholders are tabstops with values, like `${1:foo}`. The placeholder text will be inserted and selected such that it can be easily changed. Placeholders can nested, like `${1:another ${2:placeholder}}`.

Variables
--

With `$name` or `${name:default}` you can insert the value of a variable. When a variable isn’t set its *default* or the empty string is inserted. When a varibale is unknown (that is, its name isn’t defined) the name of the variable is inserted and it is transformed into a placeholder. The following variables can be used:

* `TM_SELECTED_TEXT` The currently selected text or the empty string
* `TM_CURRENT_LINE` The contents of the current line
* `TM_CURRENT_WORD` The contents of the word under cursor or the empty string
* `TM_LINE_INDEX` The zero-index based line number
* `TM_LINE_NUMBER` The one-index based line number
* `TM_FILENAME` The filename of the current document
* `TM_DIRECTORY` The direcorty of the current document
* `TM_FILEPATH` The full file path of the current document


Grammar
--

Below is the EBNF for snippets. With `\` (backslash) you can escape `$`, `}` and `\`.

```
any         ::= tabstop | placeholder | variable | text
tabstop     ::= '$' int | '${' int '}'
placeholder ::= '${' int ':' any '}'
variable    ::= '$' var | '${' var }' | '${' var ':' any '}'
var         ::= [_a-zA-Z] [_a-zA-Z0-9]*
int         ::= [0-9]+
text        ::= .*
```
