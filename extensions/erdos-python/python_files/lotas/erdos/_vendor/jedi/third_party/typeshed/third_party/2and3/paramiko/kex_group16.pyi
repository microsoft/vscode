import sys
from _typeshed import ReadableBuffer
from typing import Callable

from paramiko.kex_group1 import KexGroup1 as KexGroup1

if sys.version_info < (3, 0):
    from hashlib import _hash as _Hash
else:
    from hashlib import _Hash

class KexGroup16SHA512(KexGroup1):
    name: str
    P: int
    G: int
    hash_algo: Callable[[ReadableBuffer], _Hash]
