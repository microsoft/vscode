import time

def foo():
    time.sleep(3)
    print(1)

def bar():
    foo()

bar()
