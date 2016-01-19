"""
- the popular ``memoize_default`` works like a typical memoize and returns the
  default otherwise.
- ``CachedMetaClass`` uses ``memoize_default`` to do the same with classes.
"""

import inspect

NO_DEFAULT = object()


def memoize_default(default=NO_DEFAULT, evaluator_is_first_arg=False, second_arg_is_evaluator=False):
    """ This is a typical memoization decorator, BUT there is one difference:
    To prevent recursion it sets defaults.

    Preventing recursion is in this case the much bigger use than speed. I
    don't think, that there is a big speed difference, but there are many cases
    where recursion could happen (think about a = b; b = a).
    """
    def func(function):
        def wrapper(obj, *args, **kwargs):
            if evaluator_is_first_arg:
                cache = obj.memoize_cache
            elif second_arg_is_evaluator:  # needed for meta classes
                cache = args[0].memoize_cache
            else:
                cache = obj._evaluator.memoize_cache

            try:
                memo = cache[function]
            except KeyError:
                memo = {}
                cache[function] = memo

            key = (obj, args, frozenset(kwargs.items()))
            if key in memo:
                return memo[key]
            else:
                if default is not NO_DEFAULT:
                    memo[key] = default
                rv = function(obj, *args, **kwargs)
                if inspect.isgenerator(rv):
                    rv = list(rv)
                memo[key] = rv
                return rv
        return wrapper
    return func


class CachedMetaClass(type):
    """
    This is basically almost the same than the decorator above, it just caches
    class initializations. Either you do it this way or with decorators, but
    with decorators you lose class access (isinstance, etc).
    """
    @memoize_default(None, second_arg_is_evaluator=True)
    def __call__(self, *args, **kwargs):
        return super(CachedMetaClass, self).__call__(*args, **kwargs)
