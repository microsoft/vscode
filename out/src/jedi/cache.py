"""
This caching is very important for speed and memory optimizations. There's
nothing really spectacular, just some decorators. The following cache types are
available:

- module caching (`load_parser` and `save_parser`), which uses pickle and is
  really important to assure low load times of modules like ``numpy``.
- ``time_cache`` can be used to cache something for just a limited time span,
  which can be useful if there's user interaction and the user cannot react
  faster than a certain time.

This module is one of the reasons why |jedi| is not thread-safe. As you can see
there are global variables, which are holding the cache information. Some of
these variables are being cleaned after every API usage.
"""
import time
import os
import sys
import json
import hashlib
import gc
import inspect
import shutil
import re
try:
    import cPickle as pickle
except ImportError:
    import pickle

from jedi import settings
from jedi import common
from jedi import debug

_time_caches = {}

# for fast_parser, should not be deleted
parser_cache = {}


class ParserCacheItem(object):
    def __init__(self, parser, change_time=None):
        self.parser = parser
        if change_time is None:
            change_time = time.time()
        self.change_time = change_time


def clear_time_caches(delete_all=False):
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


def time_cache(time_add_setting):
    """
    s
    This decorator works as follows: Call it with a setting and after that
    use the function with a callable that returns the key.
    But: This function is only called if the key is not available. After a
    certain amount of time (`time_add_setting`) the cache is invalid.
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


@time_cache("call_signatures_validity")
def cache_call_signatures(evaluator, call, source, user_pos):
    """This function calculates the cache key."""
    index = user_pos[0] - 1
    lines = common.splitlines(source)

    before_cursor = lines[index][:user_pos[1]]
    other_lines = lines[call.start_pos[0]:index]
    whole = '\n'.join(other_lines + [before_cursor])
    before_bracket = re.match(r'.*\(', whole, re.DOTALL)

    module_path = call.get_parent_until().path
    yield None if module_path is None else (module_path, before_bracket, call.start_pos)
    yield evaluator.eval_element(call)


def underscore_memoization(func):
    """
    Decorator for methods::

        class A(object):
            def x(self):
                if self._x:
                    self._x = 10
                return self._x

    Becomes::

        class A(object):
            @underscore_memoization
            def x(self):
                return 10

    A now has an attribute ``_x`` written by this decorator.
    """
    name = '_' + func.__name__

    def wrapper(self):
        try:
            return getattr(self, name)
        except AttributeError:
            result = func(self)
            if inspect.isgenerator(result):
                result = list(result)
            setattr(self, name, result)
            return result

    return wrapper


def memoize_method(method):
    """A normal memoize function."""
    def wrapper(self, *args, **kwargs):
        dct = self.__dict__.setdefault('_memoize_method_dct', {})
        key = (args, frozenset(kwargs.items()))
        try:
            return dct[key]
        except KeyError:
            result = method(self, *args, **kwargs)
            dct[key] = result
            return result
    return wrapper


def cache_star_import(func):
    @time_cache("star_import_cache_validity")
    def wrapper(self):
        yield self.base  # The cache key
        yield func(self)
    return wrapper


def _invalidate_star_import_cache_module(module, only_main=False):
    """ Important if some new modules are being reparsed """
    try:
        t, modules = _time_caches['star_import_cache_validity'][module]
    except KeyError:
        pass
    else:
        del _time_caches['star_import_cache_validity'][module]


def invalidate_star_import_cache(path):
    """On success returns True."""
    try:
        parser_cache_item = parser_cache[path]
    except KeyError:
        pass
    else:
        _invalidate_star_import_cache_module(parser_cache_item.parser.module)


def load_parser(path):
    """
    Returns the module or None, if it fails.
    """
    p_time = os.path.getmtime(path) if path else None
    try:
        parser_cache_item = parser_cache[path]
        if not path or p_time <= parser_cache_item.change_time:
            return parser_cache_item.parser
        else:
            # In case there is already a module cached and this module
            # has to be reparsed, we also need to invalidate the import
            # caches.
            _invalidate_star_import_cache_module(parser_cache_item.parser.module)
    except KeyError:
        if settings.use_filesystem_cache:
            return ParserPickling.load_parser(path, p_time)


def save_parser(path, parser, pickling=True):
    try:
        p_time = None if path is None else os.path.getmtime(path)
    except OSError:
        p_time = None
        pickling = False

    item = ParserCacheItem(parser, p_time)
    parser_cache[path] = item
    if settings.use_filesystem_cache and pickling:
        ParserPickling.save_parser(path, item)


class ParserPickling(object):

    version = 24
    """
    Version number (integer) for file system cache.

    Increment this number when there are any incompatible changes in
    parser representation classes.  For example, the following changes
    are regarded as incompatible.

    - Class name is changed.
    - Class is moved to another module.
    - Defined slot of the class is changed.
    """

    def __init__(self):
        self.__index = None
        self.py_tag = 'cpython-%s%s' % sys.version_info[:2]
        """
        Short name for distinguish Python implementations and versions.

        It's like `sys.implementation.cache_tag` but for Python < 3.3
        we generate something similar.  See:
        http://docs.python.org/3/library/sys.html#sys.implementation

        .. todo:: Detect interpreter (e.g., PyPy).
        """

    def load_parser(self, path, original_changed_time):
        try:
            pickle_changed_time = self._index[path]
        except KeyError:
            return None
        if original_changed_time is not None \
                and pickle_changed_time < original_changed_time:
            # the pickle file is outdated
            return None

        with open(self._get_hashed_path(path), 'rb') as f:
            try:
                gc.disable()
                parser_cache_item = pickle.load(f)
            finally:
                gc.enable()

        debug.dbg('pickle loaded: %s', path)
        parser_cache[path] = parser_cache_item
        return parser_cache_item.parser

    def save_parser(self, path, parser_cache_item):
        self.__index = None
        try:
            files = self._index
        except KeyError:
            files = {}
            self._index = files

        with open(self._get_hashed_path(path), 'wb') as f:
            pickle.dump(parser_cache_item, f, pickle.HIGHEST_PROTOCOL)
            files[path] = parser_cache_item.change_time

        self._flush_index()

    @property
    def _index(self):
        if self.__index is None:
            try:
                with open(self._get_path('index.json')) as f:
                    data = json.load(f)
            except (IOError, ValueError):
                self.__index = {}
            else:
                # 0 means version is not defined (= always delete cache):
                if data.get('version', 0) != self.version:
                    self.clear_cache()
                    self.__index = {}
                else:
                    self.__index = data['index']
        return self.__index

    def _remove_old_modules(self):
        # TODO use
        change = False
        if change:
            self._flush_index(self)
            self._index  # reload index

    def _flush_index(self):
        data = {'version': self.version, 'index': self._index}
        with open(self._get_path('index.json'), 'w') as f:
            json.dump(data, f)
        self.__index = None

    def clear_cache(self):
        shutil.rmtree(self._cache_directory())

    def _get_hashed_path(self, path):
        return self._get_path('%s.pkl' % hashlib.md5(path.encode("utf-8")).hexdigest())

    def _get_path(self, file):
        dir = self._cache_directory()
        if not os.path.exists(dir):
            os.makedirs(dir)
        return os.path.join(dir, file)

    def _cache_directory(self):
        return os.path.join(settings.cache_directory, self.py_tag)


# is a singleton
ParserPickling = ParserPickling()
