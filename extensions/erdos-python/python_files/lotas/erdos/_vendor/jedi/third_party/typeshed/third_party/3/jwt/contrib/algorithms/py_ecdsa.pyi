import hashlib
from typing import Any

from jwt.algorithms import Algorithm

class ECAlgorithm(Algorithm[Any]):
    SHA256: hashlib._Hash
    SHA384: hashlib._Hash
    SHA512: hashlib._Hash
    def __init__(self, hash_alg: hashlib._Hash) -> None: ...
