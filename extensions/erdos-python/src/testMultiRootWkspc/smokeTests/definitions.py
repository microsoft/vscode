from contextlib import contextmanager

def my_decorator(fn):
    """
    This is my decorator.
    """
    def wrapper(*args, **kwargs):
        """
        This is the wrapper.
        """
        return 42
    return wrapper

@my_decorator
def thing(arg):
    """
    Thing which is decorated.
    """
    pass

@contextmanager
def my_context_manager():
    """
    This is my context manager.
    """
    print("before")
    yield
    print("after")

with my_context_manager():
    thing(19)
