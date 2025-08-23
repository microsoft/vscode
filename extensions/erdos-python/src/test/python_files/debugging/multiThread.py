import sys
import threading
import time

def bar():
    time.sleep(2)
    print('bar')

def foo(x):
    while True:
        bar()

threading.Thread(target = lambda: foo(2), name="foo").start()
foo(1)
