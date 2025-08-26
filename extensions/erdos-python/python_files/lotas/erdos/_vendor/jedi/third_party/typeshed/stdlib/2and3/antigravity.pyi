import sys

if sys.version_info >= (3, 0):
    def geohash(latitude: float, longitude: float, datedow: bytes) -> None: ...
