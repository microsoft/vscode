"""
- the popular ``_memoize_default`` works like a typical memoize and returns the
  default otherwise.
- ``CachedMetaClass`` uses ``_memoize_default`` to do the same with classes.
"""
from functools import wraps

from jedi import debug

_NO_DEFAULT = object()
_RECURSION_SENTINEL = object()


def _memoize_default(default=_NO_DEFAULT, inference_state_is_first_arg=False,
                     second_arg_is_inference_state=False):
    """ This is a typical memoization decorator, BUT there is one difference:
    To prevent recursion it sets defaults.

    Preventing recursion is in this case the much bigger use than speed. I
    don't think, that there is a big speed difference, but there are many cases
    where recursion could happen (think about a = b; b = a).
    """
    def func(function):
        def wrapper(obj, *args, **kwargs):
            # TODO These checks are kind of ugly and slow.
            if inference_state_is_first_arg:
                cache = obj.memoize_cache
            elif second_arg_is_inference_state:
                cache = args[0].memoize_cache  # needed for meta classes
            else:
                cache = obj.inference_state.memoize_cache

            try:
                memo = cache[function]
            except KeyError:
                cache[function] = memo = {}

            key = (obj, args, frozenset(kwargs.items()))
            if key in memo:
                return memo[key]
            else:
                if default is not _NO_DEFAULT:
                    memo[key] = default
                rv = function(obj, *args, **kwargs)
                memo[key] = rv
                return rv
        return wrapper

    return func


def inference_state_function_cache(default=_NO_DEFAULT):
    def decorator(func):
        return _memoize_default(default=default, inference_state_is_first_arg=True)(func)

    return decorator


def inference_state_method_cache(default=_NO_DEFAULT):
    def decorator(func):
        return _memoize_default(default=default)(func)

    return decorator


def inference_state_as_method_param_cache():
    def decorator(call):
        return _memoize_default(second_arg_is_inference_state=True)(call)

    return decorator


class CachedMetaClass(type):
    """
    This is basically almost the same than the decorator above, it just caches
    class initializations. Either you do it this way or with decorators, but
    with decorators you lose class access (isinstance, etc).
    """
    @inference_state_as_method_param_cache()
    def __call__(self, *args, **kwargs):
        return super().__call__(*args, **kwargs)


def inference_state_method_generator_cache():
    """
    This is a special memoizer. It memoizes generators and also checks for
    recursion errors and returns no further iterator elemends in that case.
    """
    def func(function):
        @wraps(function)
        def wrapper(obj, *args, **kwargs):
            cache = obj.inference_state.memoize_cache
            try:
                memo = cache[function]
            except KeyError:
                cache[function] = memo = {}

            key = (obj, args, frozenset(kwargs.items()))

            if key in memo:
                actual_generator, cached_lst = memo[key]
            else:
                actual_generator = function(obj, *args, **kwargs)
                cached_lst = []
                memo[key] = actual_generator, cached_lst

            i = 0
            while True:
                try:
                    next_element = cached_lst[i]
                    if next_element is _RECURSION_SENTINEL:
                        debug.warning('Found a generator recursion for %s' % obj)
                        # This means we have hit a recursion.
                        return
                except IndexError:
                    cached_lst.append(_RECURSION_SENTINEL)
                    next_element = next(actual_generator, None)
                    if next_element is None:
                        cached_lst.pop()
                        return
                    cached_lst[-1] = next_element
                yield next_element
                i += 1
        return wrapper

    return func
