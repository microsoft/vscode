### Case 1
a "\${b}"

### Case 2
a "'b'"

### Case 3
a "\${b:+"c"}"

### Case 4
a b"c"

### Case 5
a '\${b}'

### Case 6
a $'\${b}'

### Case 7
a $'b''c'd$$$e\${f}"g"

### Case 8
a $'b\\'c'

### Case 9
a 'b\\'c'

### Case 10
a "b$"

### Case 11
a "$b"

### Case 12
a "$(b "c" && d)"