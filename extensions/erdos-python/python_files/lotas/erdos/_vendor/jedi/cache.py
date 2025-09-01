"""
This caching is very important for speed and memory optimizations. There's
nothing really spectacular, just some decorators. The following cache types are
available:

- ``time_cache`` can be used to cache something for just a limited time span,
  which can be useful if there's user interaction and the user cannot react
  faster than a certain time.

This module is one of the reasons why |jedi| is not thread-safe. As you can see
there are global variables, which are holding the cache information. Some of
these variables are being cleaned after every API usage.
"""
import time
from functools import wraps
from typing import Any, Dict, Tuple

from jedi import settings
from erdos._vendor.parso.cache import parser_cache

_time_caches: Dict[str, Dict[Any, Tuple[float, Any]]] = {}


def clear_time_caches(delete_all: bool = False) -> None:
    """ Jedi caches many things, that should be completed after each completion
    finishes.

    :param delete_all: Deletes also the cache that is normally not deleted,
        like parser cache, which is important for faster parsing.
    """
    global _time_caches

    if delete_all:
        for cache in _time_caches.values():
            cache.clear()
        parser_cache.clear()
    else:
        # normally just kill the expired entries, not all
        for tc in _time_caches.values():
            # check time_cache for expired entries
            for key, (t, value) in list(tc.items()):
                if t < time.time():
                    # delete expired entries
                    del tc[key]


def signature_time_cache(time_add_setting):
    """
    This decorator works as follows: Call it with a setting and after that
    use the function with a callable that returns the key.
    But: This function is only called if the key is not available. After a
    certain amount of time (`time_add_setting`) the cache is invalid.

    If the given key is None, the function will not be cached.
    """
    def _temp(key_func):
        dct = {}
        _time_caches[time_add_setting] = dct

        def wrapper(*args, **kwargs):
            generator = key_func(*args, **kwargs)
            key = next(generator)
            try:
                expiry, value = dct[key]
                if expiry > time.time():
                    return value
            except KeyError:
                pass

            value = next(generator)
            time_add = getattr(settings, time_add_setting)
            if key is not None:
                dct[key] = time.time() + time_add, value
            return value
        return wrapper
    return _temp


def time_cache(seconds):
    def decorator(func):
        cache = {}

        @wraps(func)
        def wrapper(*args, **kwargs):
            key = (args, frozenset(kwargs.items()))
            try:
                created, result = cache[key]
                if time.time() < created + seconds:
                    return result
            except KeyError:
                pass
            result = func(*args, **kwargs)
            cache[key] = time.time(), result
            return result

        wrapper.clear_cache = lambda: cache.clear()
        return wrapper

    return decorator


def memoize_method(method):
    """A normal memoize function."""
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        cache_dict = self.__dict__.setdefault('_memoize_method_dct', {})
        dct = cache_dict.setdefault(method, {})
        key = (args, frozenset(kwargs.items()))
        try:
            return dct[key]
        except KeyError:
            result = method(self, *args, **kwargs)
            dct[key] = result
            return result
    return wrapper
