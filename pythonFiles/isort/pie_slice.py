"""pie_slice/overrides.py.

Overrides Python syntax to conform to the Python3 version as much as possible using a '*' import

Copyright (C) 2013  Timothy Edmund Crosley

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copie_slice of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copie_slice or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

"""
from __future__ import absolute_import

import abc
import functools
import sys
from numbers import Integral

__version__ = "1.1.0"

PY2 = sys.version_info[0] == 2
PY3 = sys.version_info[0] == 3
VERSION = sys.version_info

native_dict = dict
native_round = round
native_filter = filter
native_map = map
native_zip = zip
native_range = range
native_str = str
native_chr = chr
native_input = input
native_next = next
native_object = object

common = ['native_dict', 'native_round', 'native_filter', 'native_map', 'native_range', 'native_str', 'native_chr',
          'native_input', 'PY2', 'PY3', 'u', 'itemsview', 'valuesview', 'keysview', 'execute', 'integer_types',
          'native_next', 'native_object', 'with_metaclass', 'OrderedDict', 'lru_cache']


def with_metaclass(meta, *bases):
    """Enables use of meta classes across Python Versions. taken from jinja2/_compat.py.

    Use it like this::

        class BaseForm(object):
            pass

        class FormType(type):
            pass

        class Form(with_metaclass(FormType, BaseForm)):
            pass

    """
    class metaclass(meta):
        __call__ = type.__call__
        __init__ = type.__init__
        def __new__(cls, name, this_bases, d):
            if this_bases is None:
                return type.__new__(cls, name, (), d)
            return meta(name, bases, d)
    return metaclass('temporary_class', None, {})


def unmodified_isinstance(*bases):
    """When called in the form

    MyOverrideClass(unmodified_isinstance(BuiltInClass))

    it allows calls against passed in built in instances to pass even if there not a subclass

    """
    class UnmodifiedIsInstance(type):
        if sys.version_info[0] == 2 and sys.version_info[1] <= 6:

            @classmethod
            def __instancecheck__(cls, instance):
                if cls.__name__ in (str(base.__name__) for base in bases):
                    return isinstance(instance, bases)

                subclass = getattr(instance, '__class__', None)
                subtype = type(instance)
                instance_type = getattr(abc, '_InstanceType', None)
                if not instance_type:
                    class test_object:
                        pass
                    instance_type = type(test_object)
                if subtype is instance_type:
                    subtype = subclass
                if subtype is subclass or subclass is None:
                    return cls.__subclasscheck__(subtype)
                return (cls.__subclasscheck__(subclass) or cls.__subclasscheck__(subtype))
        else:
            @classmethod
            def __instancecheck__(cls, instance):
                if cls.__name__ in (str(base.__name__) for base in bases):
                    return isinstance(instance, bases)

                return type.__instancecheck__(cls, instance)

    return with_metaclass(UnmodifiedIsInstance, *bases)


if PY3:
    import urllib
    import builtins
    from urllib import parse

    integer_types = (int, )

    def u(string):
        return string

    def itemsview(collection):
        return collection.items()

    def valuesview(collection):
        return collection.values()

    def keysview(collection):
        return collection.keys()

    urllib.quote = parse.quote
    urllib.quote_plus = parse.quote_plus
    urllib.unquote = parse.unquote
    urllib.unquote_plus = parse.unquote_plus
    urllib.urlencode = parse.urlencode
    execute = getattr(builtins, 'exec')
    if VERSION[1] < 2:
        def callable(entity):
            return hasattr(entity, '__call__')
        common.append('callable')

    __all__ = common + ['urllib']
else:
    from itertools import ifilter as filter
    from itertools import imap as map
    from itertools import izip as zip
    from decimal import Decimal, ROUND_HALF_EVEN

    import codecs
    str = unicode
    chr = unichr
    input = raw_input
    range = xrange
    integer_types = (int, long)

    import sys
    stdout = sys.stdout
    stderr = sys.stderr
    reload(sys)
    sys.stdout = stdout
    sys.stderr = stderr
    sys.setdefaultencoding('utf-8')

    def _create_not_allowed(name):
        def _not_allow(*args, **kwargs):
            raise NameError("name '{0}' is not defined".format(name))
        _not_allow.__name__ = name
        return _not_allow

    for removed in ('apply', 'cmp', 'coerce', 'execfile', 'raw_input', 'unpacks'):
        globals()[removed] = _create_not_allowed(removed)

    def u(s):
        if isinstance(s, unicode):
            return s
        else:
            return unicode(s.replace(r'\\', r'\\\\'), "unicode_escape")

    def execute(_code_, _globs_=None, _locs_=None):
        """Execute code in a namespace."""
        if _globs_ is None:
            frame = sys._getframe(1)
            _globs_ = frame.f_globals
            if _locs_ is None:
                _locs_ = frame.f_locals
            del frame
        elif _locs_ is None:
            _locs_ = _globs_
        exec("""exec _code_ in _globs_, _locs_""")

    class _dict_view_base(object):
        __slots__ = ('_dictionary', )

        def __init__(self, dictionary):
            self._dictionary = dictionary

        def __repr__(self):
            return "{0}({1})".format(self.__class__.__name__, str(list(self.__iter__())))

        def __unicode__(self):
            return str(self.__repr__())

        def __str__(self):
            return str(self.__unicode__())

    class dict_keys(_dict_view_base):
        __slots__ = ()

        def __iter__(self):
            return self._dictionary.iterkeys()

    class dict_values(_dict_view_base):
        __slots__ = ()

        def __iter__(self):
            return self._dictionary.itervalues()

    class dict_items(_dict_view_base):
        __slots__ = ()

        def __iter__(self):
            return self._dictionary.iteritems()

    def itemsview(collection):
        return dict_items(collection)

    def valuesview(collection):
        return dict_values(collection)

    def keysview(collection):
        return dict_keys(collection)

    class dict(unmodified_isinstance(native_dict)):
        def has_key(self, *args, **kwargs):
            return AttributeError("'dict' object has no attribute 'has_key'")

        def items(self):
            return dict_items(self)

        def keys(self):
            return dict_keys(self)

        def values(self):
            return dict_values(self)

    def round(number, ndigits=None):
        return_int = False
        if ndigits is None:
            return_int = True
            ndigits = 0
        if hasattr(number, '__round__'):
            return number.__round__(ndigits)

        if ndigits < 0:
            raise NotImplementedError('negative ndigits not supported yet')
        exponent = Decimal('10') ** (-ndigits)
        d = Decimal.from_float(number).quantize(exponent,
                                                rounding=ROUND_HALF_EVEN)
        if return_int:
            return int(d)
        else:
            return float(d)

    def next(iterator):
        try:
            iterator.__next__()
        except Exception:
            native_next(iterator)

    class FixStr(type):
        def __new__(cls, name, bases, dct):
            if '__str__' in dct:
                dct['__unicode__'] = dct['__str__']
            dct['__str__'] = lambda self: self.__unicode__().encode('utf-8')
            return type.__new__(cls, name, bases, dct)

        if sys.version_info[1] <= 6:
            def __instancecheck__(cls, instance):
                if cls.__name__ == "object":
                    return isinstance(instance, native_object)

                subclass = getattr(instance, '__class__', None)
                subtype = type(instance)
                instance_type = getattr(abc, '_InstanceType', None)
                if not instance_type:
                    class test_object:
                        pass
                    instance_type = type(test_object)
                if subtype is instance_type:
                    subtype = subclass
                if subtype is subclass or subclass is None:
                    return cls.__subclasscheck__(subtype)
                return (cls.__subclasscheck__(subclass) or cls.__subclasscheck__(subtype))
        else:
            def __instancecheck__(cls, instance):
                if cls.__name__ == "object":
                    return isinstance(instance, native_object)
                return type.__instancecheck__(cls, instance)

    class object(with_metaclass(FixStr, object)):
        pass

    __all__ = common + ['round', 'dict', 'apply', 'cmp', 'coerce', 'execfile', 'raw_input', 'unpacks', 'str', 'chr',
                        'input', 'range', 'filter', 'map', 'zip', 'object']

if sys.version_info[0] == 2 and sys.version_info[1] < 7:
    # OrderedDict
    # Copyright (c) 2009 Raymond Hettinger
    #
    # Permission is hereby granted, free of charge, to any person
    # obtaining a copy of this software and associated documentation files
    # (the "Software"), to deal in the Software without restriction,
    # including without limitation the rights to use, copy, modify, merge,
    # publish, distribute, sublicense, and/or sell copies of the Software,
    # and to permit persons to whom the Software is furnished to do so,
    # subject to the following conditions:
    #
    #     The above copyright notice and this permission notice shall be
    #     included in all copies or substantial portions of the Software.
    #
    #     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    #     EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    #     OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    #     NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
    #     HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
    #     WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    #     FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
    #     OTHER DEALINGS IN THE SOFTWARE.

    from UserDict import DictMixin

    class OrderedDict(dict, DictMixin):

        def __init__(self, *args, **kwds):
            if len(args) > 1:
                raise TypeError('expected at most 1 arguments, got %d' % len(args))
            try:
                self.__end
            except AttributeError:
                self.clear()
            self.update(*args, **kwds)

        def clear(self):
            self.__end = end = []
            end += [None, end, end]         # sentinel node for doubly linked list
            self.__map = {}                 # key --> [key, prev, next]
            dict.clear(self)

        def __setitem__(self, key, value):
            if key not in self:
                end = self.__end
                curr = end[1]
                curr[2] = end[1] = self.__map[key] = [key, curr, end]
            dict.__setitem__(self, key, value)

        def __delitem__(self, key):
            dict.__delitem__(self, key)
            key, prev, next = self.__map.pop(key)
            prev[2] = next
            next[1] = prev

        def __iter__(self):
            end = self.__end
            curr = end[2]
            while curr is not end:
                yield curr[0]
                curr = curr[2]

        def __reversed__(self):
            end = self.__end
            curr = end[1]
            while curr is not end:
                yield curr[0]
                curr = curr[1]

        def popitem(self, last=True):
            if not self:
                raise KeyError('dictionary is empty')
            if last:
                key = reversed(self).next()
            else:
                key = iter(self).next()
            value = self.pop(key)
            return key, value

        def __reduce__(self):
            items = [[k, self[k]] for k in self]
            tmp = self.__map, self.__end
            del self.__map, self.__end
            inst_dict = vars(self).copy()
            self.__map, self.__end = tmp
            if inst_dict:
                return (self.__class__, (items,), inst_dict)
            return self.__class__, (items,)

        def keys(self):
            return list(self)

        setdefault = DictMixin.setdefault
        update = DictMixin.update
        pop = DictMixin.pop
        values = DictMixin.values
        items = DictMixin.items
        iterkeys = DictMixin.iterkeys
        itervalues = DictMixin.itervalues
        iteritems = DictMixin.iteritems

        def __repr__(self):
            if not self:
                return '%s()' % (self.__class__.__name__,)
            return '%s(%r)' % (self.__class__.__name__, self.items())

        def copy(self):
            return self.__class__(self)

        @classmethod
        def fromkeys(cls, iterable, value=None):
            d = cls()
            for key in iterable:
                d[key] = value
            return d

        def __eq__(self, other):
            if isinstance(other, OrderedDict):
                if len(self) != len(other):
                    return False
                for p, q in  zip(self.items(), other.items()):
                    if p != q:
                        return False
                return True
            return dict.__eq__(self, other)

        def __ne__(self, other):
            return not self == other
else:
    from collections import OrderedDict


if sys.version_info < (3, 2):
    try:
        from threading import Lock
    except ImportError:
        from dummy_threading import Lock

    from functools import wraps

    def lru_cache(maxsize=100):
        """Least-recently-used cache decorator.
        Taking from: https://github.com/MiCHiLU/python-functools32/blob/master/functools32/functools32.py
        with slight modifications.
        If *maxsize* is set to None, the LRU features are disabled and the cache
        can grow without bound.
        Arguments to the cached function must be hashable.
        View the cache statistics named tuple (hits, misses, maxsize, currsize) with
        f.cache_info().  Clear the cache and statistics with f.cache_clear().
        Access the underlying function with f.__wrapped__.
        See:  http://en.wikipedia.org/wiki/Cache_algorithms#Least_Recently_Used

        """
        def decorating_function(user_function, tuple=tuple, sorted=sorted, len=len, KeyError=KeyError):
            hits, misses = [0], [0]
            kwd_mark = (object(),)          # separates positional and keyword args
            lock = Lock()

            if maxsize is None:
                CACHE = dict()

                @wraps(user_function)
                def wrapper(*args, **kwds):
                    key = args
                    if kwds:
                        key += kwd_mark + tuple(sorted(kwds.items()))
                    try:
                        result = CACHE[key]
                        hits[0] += 1
                        return result
                    except KeyError:
                        pass
                    result = user_function(*args, **kwds)
                    CACHE[key] = result
                    misses[0] += 1
                    return result
            else:
                CACHE = OrderedDict()

                @wraps(user_function)
                def wrapper(*args, **kwds):
                    key = args
                    if kwds:
                        key += kwd_mark + tuple(sorted(kwds.items()))
                    with lock:
                        cached = CACHE.get(key, None)
                        if cached:
                            del CACHE[key]
                            CACHE[key] = cached
                            hits[0] += 1
                            return cached
                    result = user_function(*args, **kwds)
                    with lock:
                        CACHE[key] = result     # record recent use of this key
                        misses[0] += 1
                        while len(CACHE) > maxsize:
                            CACHE.popitem(last=False)
                    return result

            def cache_info():
                """Report CACHE statistics."""
                with lock:
                    return _CacheInfo(hits[0], misses[0], maxsize, len(CACHE))

            def cache_clear():
                """Clear the CACHE and CACHE statistics."""
                with lock:
                    CACHE.clear()
                    hits[0] = misses[0] = 0

            wrapper.cache_info = cache_info
            wrapper.cache_clear = cache_clear
            return wrapper

        return decorating_function

else:
    from functools import lru_cache
