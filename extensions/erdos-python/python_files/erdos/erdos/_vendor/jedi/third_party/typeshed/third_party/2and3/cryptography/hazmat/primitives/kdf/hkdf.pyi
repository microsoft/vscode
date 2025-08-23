from typing import Optional

from cryptography.hazmat.backends.interfaces import HMACBackend
from cryptography.hazmat.primitives.hashes import HashAlgorithm
from cryptography.hazmat.primitives.kdf import KeyDerivationFunction

class HKDF(KeyDerivationFunction):
    def __init__(
        self,
        algorithm: HashAlgorithm,
        length: int,
        salt: Optional[bytes],
        info: Optional[bytes],
        backend: Optional[HMACBackend] = ...,
    ): ...
    def derive(self, key_material: bytes) -> bytes: ...
    def verify(self, key_material: bytes, expected_key: bytes) -> None: ...

class HKDFExpand(KeyDerivationFunction):
    def __init__(self, algorithm: HashAlgorithm, length: int, info: Optional[bytes], backend: Optional[HMACBackend] = ...): ...
    def derive(self, key_material: bytes) -> bytes: ...
    def verify(self, key_material: bytes, expected_key: bytes) -> None: ...
