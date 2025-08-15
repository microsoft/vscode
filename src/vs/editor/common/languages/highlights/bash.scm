; Basic highlighting for bash shell scripts
; Focus on command parsing for terminal command splitting

; Commands and function calls
(command
  name: (word) @entity.name.function.bash)

(function_definition
  name: (word) @entity.name.function.bash)

; Variables
(variable_name) @variable.bash
(simple_expansion
  (variable_name) @variable.bash)
(expansion
  (variable_name) @variable.bash)

; Strings
(string) @string.quoted.bash
(raw_string) @string.quoted.bash
(ansii_c_string) @string.quoted.bash

; Comments
(comment) @comment.bash

; Keywords and operators
[
  "if"
  "then"
  "else"
  "elif"
  "fi"
  "for"
  "do"
  "done"
  "while"
  "until"
  "case"
  "esac"
  "function"
] @keyword.control.bash

; Operators
[
  "&&"
  "||"
  "|"
  "&"
  ";"
  ">"
  "<"
  ">>"
  "<<"
  "&>"
  "&>>"
] @keyword.operator.bash

; Redirections
(redirect) @keyword.operator.bash

; File descriptors
(file_descriptor) @constant.numeric.bash

; Numbers
(number) @constant.numeric.bash

; Literals
[
  (true)
  (false)
] @constant.language.boolean.bash