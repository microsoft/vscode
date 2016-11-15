
Tabstops
--

With tabstops you can make the editor cursor move inside a snippet. Use `$1`, `$2` to specify cursor locations. The number is the order in which tabstops will be visited, whereas `$0` denotes the final cursor position. Multiple tabstops are linked and updated in sync.

Placeholders
--

Placeholders are tabstops with values, like `${1:foo}`. The placeholder text will be inserted and selected such that it can be easily changed. Placeholders can nested, like `${1:another ${2:placeholder}}`.

Variables
--

With `$name` or `${name:default}` you can insert the value of a variable. When a variable isn’t set its *default* or the empty string is inserted. When a varibale is unknown (that is, its name isn’t defined) the name of the variable is inserted and it is transformed into a placeholder.


Grammar
--

Below is the EBNF for snippets. The `$`-character can be escaped  using backslash, like `\$`.

```
any         ::= tabstop | placeholder | variable | text
tabstop     ::= '$' int | '${' int '}'
placeholder ::= '${' int ':' any '}'
variable    ::= '$' var | '${' var }' | '${' var ':' any '}'
var         ::= [_a-zA-Z] [_a-zA-Z0-9]*
int         ::= [0-9]+
text        ::= .*
```
