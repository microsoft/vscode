print("hello")

def this_will_throw_an_error():
    print("inside")
    print(1/0)

this_will_throw_an_error()

print("bye")
