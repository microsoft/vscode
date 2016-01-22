"""isort/natural.py.

Enables sorting strings that contain numbers naturally

usage:
    natural.nsorted(list)

Copyright (C) 2013  Timothy Edmund Crosley

Implementation originally from @HappyLeapSecond stack overflow user in response to:
   http://stackoverflow.com/questions/5967500/how-to-correctly-sort-a-string-with-a-number-inside

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

"""
import re


def _atoi(text):
    return int(text) if text.isdigit() else text


def _natural_keys(text):
    return [_atoi(c) for c in re.split('(\d+)', text)]


def nsorted(to_sort, key=None):
    """Returns a naturally sorted list"""
    if key is None:
        key_callback = _natural_keys
    else:
        def key_callback(item):
            return _natural_keys(key(item))

    return sorted(to_sort, key=key_callback)
