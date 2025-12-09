### Case 1
ENV=a b

### Case 2
ENV=a b c d --op=e

### Case 3
ENV=a ENV=b a

### Case 4
ENV=a ENV=b a && ENV=c c

### Case 5
ENV="a b" c

### Case 6
ENV='a b' c

### Case 7
ENV=`cmd` a

### Case 8
ENV+='100' b

### Case 9
ENV+=a ENV=b

### Case 10
ENV+=a ENV=b && foo

### Case 11
ENV="a

### Case 12
ENV='a

### Case 13
ENV=a ENV=`b

### Case 14
ENV=`ENV="a" b` && ENV="c" d

### Case 15
c $(ENV=a foo)

### Case 16
ENV=a; b

### Case 17
ENV=a ; b

### Case 18
ENV=a & b

### Case 19
ENV=a|b

### Case 20
ENV[0]=a b

### Case 21
ENV[0]=a; b

### Case 22
ENV[1]=`a b

### Case 23
ENV[2]+="a b "

### Case 24
MY_VAR='echo'hi$'quote'"command: $(ps | VAR=2 grep ps)"

### Case 25
ENV="a"'b'c d

### Case 26
ENV=a"b"'c'