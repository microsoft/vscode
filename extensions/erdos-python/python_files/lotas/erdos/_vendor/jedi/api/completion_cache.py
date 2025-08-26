from typing import Dict, Tuple, Callable

CacheValues = Tuple[str, str, str]
CacheValuesCallback = Callable[[], CacheValues]


_cache: Dict[str, Dict[str, CacheValues]] = {}


def save_entry(module_name: str, name: str, cache: CacheValues) -> None:
    try:
        module_cache = _cache[module_name]
    except KeyError:
        module_cache = _cache[module_name] = {}
    module_cache[name] = cache


def _create_get_from_cache(number: int) -> Callable[[str, str, CacheValuesCallback], str]:
    def _get_from_cache(module_name: str, name: str, get_cache_values: CacheValuesCallback) -> str:
        try:
            return _cache[module_name][name][number]
        except KeyError:
            v = get_cache_values()
            save_entry(module_name, name, v)
            return v[number]
    return _get_from_cache


get_type = _create_get_from_cache(0)
get_docstring_signature = _create_get_from_cache(1)
get_docstring = _create_get_from_cache(2)
