#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import builtins
import importlib
import logging
import pkgutil
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class PythonHelpCache:
    """
    Exact port of Rao's R help caching strategy.
    Equivalent to .rs.setVar("topicsEnv", new.env(parent = emptyenv()))
    """
    
    def __init__(self):
        # Equivalent to .rs.setVar("topicsEnv", new.env(parent = emptyenv()))
        self._topics_env: Dict[str, List[str]] = {}
        self._all_topics_flat: List[str] = []
        self._last_package_list: List[str] = []
    
    def get_cached_topics(self, module_path: str) -> Optional[List[str]]:
        """
        Equivalent to: if (exists(pkgpath, envir = .rs.topicsEnv))
                        return(get(pkgpath, envir = .rs.topicsEnv))
        """
        if module_path in self._topics_env:
            return self._topics_env[module_path]
        return None
    
    def cache_topics(self, module_path: str, topics: List[str]):
        """
        Equivalent to: assign(pkgpath, value, envir = .rs.topicsEnv)
        """
        self._topics_env[module_path] = topics
        # Invalidate flat list on module cache update
        self._all_topics_flat = []
    
    def get_all_topics_flat(self) -> List[str]:
        """Get all cached topics as a flat list"""
        if not self._all_topics_flat and self._topics_env:
            # Build flat list from all cached modules
            import itertools
            self._all_topics_flat = list(set(itertools.chain.from_iterable(self._topics_env.values())))
        return self._all_topics_flat
    
    def clear_cache(self):
        """Clear all cached topics (for testing or kernel restart)"""
        self._topics_env.clear()
        self._all_topics_flat = []
        self._last_package_list = []


def is_subsequence(haystack: str, needle: str) -> bool:
    """
    Exact port of rao/src/cpp/core/StringUtils.cpp isSubsequence function.
    
    Args:
        haystack: The string to search in
        needle: The subsequence to find
        
    Returns:
        True if needle is a subsequence of haystack
    """
    if not needle:
        return True
    if not haystack:
        return False
    
    needle_len = len(needle)
    haystack_len = len(haystack)
    
    if needle_len > haystack_len:
        return False
    
    haystack_idx = 0
    needle_idx = 0
    
    while haystack_idx < haystack_len:
        haystack_char = haystack[haystack_idx]
        needle_char = needle[needle_idx]
        
        if needle_char == haystack_char:
            needle_idx += 1
            if needle_idx == needle_len:
                return True
        
        haystack_idx += 1
    
    return False


def subsequence_indices(sequence: str, query: str) -> List[int]:
    """
    Exact port of rao/src/cpp/core/StringUtils.cpp subsequenceIndices function.
    
    Args:
        sequence: The string to search in
        query: The query to find indices for
        
    Returns:
        List of indices where query characters are found in sequence
    """
    query_size = len(query)
    result = []
    
    prev_match_index = -1
    for i in range(query_size):
        try:
            index = sequence.find(query[i], prev_match_index + 1)
            if index == -1:
                continue
            result.append(index)
            prev_match_index = index
        except Exception:
            continue
    
    return result


def score_match(suggestion: str, query: str, is_file: bool = False) -> int:
    """
    Exact port of rao/src/cpp/session/modules/SessionCodeSearch.cpp scoreMatch function.
    
    Args:
        suggestion: The suggestion to score
        query: The query to match against
        is_file: Whether this is a file (affects scoring)
        
    Returns:
        Integer score (lower is better, 0 is perfect match)
    """
    # No penalty for perfect matches
    if suggestion == query:
        return 0
    
    matches = subsequence_indices(suggestion, query)
    total_penalty = 0
    
    # Loop over the matches and assign a score
    for j, match_pos in enumerate(matches):
        penalty = match_pos
        
        # Less penalty if character follows special delim
        if match_pos >= 1:
            prev_char = suggestion[match_pos - 1]
            if prev_char == '_' or prev_char == '-' or (not is_file and prev_char == '.'):
                penalty = j + 1
        
        # Less penalty for perfect match (reward case-sensitive match)
        if suggestion[match_pos] == query[j]:
            penalty -= 1
        
        total_penalty += penalty
    
    # Penalize files
    if is_file:
        total_penalty += 1
        # Note: Could add isUninterestingFile logic here if needed
    
    # Penalize unmatched characters
    total_penalty += (len(query) - len(matches)) * len(query)
    
    return total_penalty


def score_matches(strings: List[str], query: str) -> List[int]:
    """
    Exact port of rao/src/cpp/session/modules/SessionCodeSearch.cpp rs_scoreMatches function.
    
    Args:
        strings: List of strings to score
        query: Query to match against
        
    Returns:
        List of scores (same length as strings)
    """
    scores = []
    for string in strings:
        scores.append(score_match(string, query, is_file=False))
    return scores


def get_current_package_list() -> List[str]:
    """Get current list of available packages for cache invalidation"""
    package_list = []
    
    # Add built-ins
    package_list.append("__builtins__")
    
    # Add all discoverable modules
    for importer, modname, ispkg in pkgutil.iter_modules():
        if not modname.startswith('_') and modname != 'antigravity':
            package_list.append(modname)
    
    return sorted(package_list)  # Sort for consistent comparison


def discover_all_help_topics(cache: PythonHelpCache) -> List[str]:
    """
    Systematic discovery of ALL available Python help topics.
    Python equivalent of R's path.package(quiet = TRUE) approach.
    
    Uses aggressive caching - only does expensive discovery once, then reuses cached results.
    
    Args:
        cache: PythonHelpCache instance for caching
        
    Returns:
        List of all discoverable help topics
    """
    import time
    
    # Check if we have a complete cached discovery (like Rao's .rs.topicsEnv)
    current_time = time.time()
    cache_expiry_hours = 24  # Refresh cache daily like Rao
    
    # If we have cached flat topics and they're not expired, use them immediately
    cached_flat = cache.get_all_topics_flat()
    if (cached_flat and 
        cache._last_discovery_time > 0 and 
        (current_time - cache._last_discovery_time) < (cache_expiry_hours * 3600)):
        return cached_flat
    
    # Need to do expensive discovery - clear cache and rebuild
    cache.clear_cache()
    all_topics = []
    
    # 1. Built-ins (equivalent to R base package) - fast discovery
    builtin_topics = []
    for name in dir(builtins):
        if not name.startswith('_'):
            builtin_topics.append(name)
    
    cache.cache_topics("__builtins__", builtin_topics)
    all_topics.extend(builtin_topics)
    
    # 2. ALL discoverable modules (equivalent to R path.package) - expensive part
    # This is the slow operation that we want to do only once
    for importer, modname, ispkg in pkgutil.iter_modules():
        try:
            if modname.startswith('_') or modname == 'antigravity':
                continue
            
            # Discover topics for this module
            module_topics = []
            module = importlib.import_module(modname)
            module_topics.append(modname)
            
            # All public members (equivalent to R help aliases)
            for name in dir(module):
                if not name.startswith('_'):
                    module_topics.append(f'{modname}.{name}')
            
            # Cache the topics for this module
            cache.cache_topics(modname, module_topics)
            all_topics.extend(module_topics)
            
        except ImportError:
            # Module couldn't be imported, skip it
            continue
        except Exception:
            # Any other error, skip this module
            continue
    
    # Mark discovery as complete
    cache._last_discovery_time = current_time
    
    return all_topics


def search_help_topics(query: str, cache: PythonHelpCache, max_results: int = 50) -> List[str]:
    """
    Exact port of rao/src/cpp/session/modules/SessionHelp.R suggest_topics function.
    
    Args:
        query: Search query string
        cache: PythonHelpCache instance
        max_results: Maximum number of results to return
        
    Returns:
        List of topic names ranked by relevance
    """
    # Get all topics (uses caching for performance)
    all_topics = discover_all_help_topics(cache)
    
    if not query:
        return all_topics[:max_results]
    
    # Convert to lowercase for matching (like R's tolower)
    flat_lower = [topic.lower() for topic in all_topics]
    query_lower = query.lower()
    
    # Score all topics using RStudio algorithm
    # scores <- .rs.scoreMatches(tolower(flat), tolower(query))
    scores = score_matches(flat_lower, query_lower)
    
    # Order by score and string length
    # ordered <- flat[order(scores, nchar(flat))]
    score_indices = list(range(len(scores)))
    score_indices.sort(key=lambda i: (scores[i], len(all_topics[i])))
    ordered = [all_topics[i] for i in score_indices]
    
    # Filter by subsequence match (RStudio-style)
    # matches <- unique(ordered[.rs.isSubsequence(tolower(ordered), tolower(query))])
    ordered_lower = [topic.lower() for topic in ordered]
    matches = []
    seen = set()
    for topic in ordered:
        topic_lower = topic.lower()
        if topic not in seen and is_subsequence(topic_lower, query_lower):
            matches.append(topic)
            seen.add(topic)
    
    # Force first character to match, but allow typos after
    # Also keep matches with one or more leading '.', so that e.g.
    # the prefix 'libpaths' can match '.libPaths'
    if query:
        # first <- .rs.escapeForRegex(substring(query, 1L, 1L))
        # pattern <- sprintf("^[.]*[%s]", first)
        # matches <- grep(pattern, matches, value = TRUE, perl = TRUE)
        first_char = re.escape(query[0].lower())
        pattern = f'^[.]*[{first_char}]'
        filtered_matches = []
        for match in matches:
            if re.match(pattern, match, re.IGNORECASE):
                filtered_matches.append(match)
        matches = filtered_matches
    
    return matches[:max_results]


# Global cache instance (persists until Python kernel restart, like R session)
_help_cache = PythonHelpCache()


def search_help_topics_rpc(query: str = "") -> List[str]:
    """
    RPC entry point for help topic search.
    This is the function that will be called by the help service.
    
    Args:
        query: Search query string (empty string returns first 50 topics)
        
    Returns:
        List of topic names ranked by relevance
    """

    global _help_cache
    
    try:
        results = search_help_topics(query, _help_cache)

        return results
    except Exception as e:

        logger.error(f"Error in search_help_topics_rpc: {e}")
        return []


def clear_help_cache():
    """Clear the help cache (for testing or manual cache reset)"""
    global _help_cache
    _help_cache.clear_cache()


def warm_help_cache():
    """
    Pre-warm the help cache by doing initial discovery in background.
    This should be called once on service startup to make searches fast.
    """
    global _help_cache
    try:
        # Trigger discovery which will populate the cache
        discover_all_help_topics(_help_cache)
    except Exception as e:
        logger.error(f"Error warming help cache: {e}")


# NOTE: Cache warming moved to HelpService.start() to avoid importing matplotlib 
# before MPLBACKEND environment variable can be set during kernel initialization
