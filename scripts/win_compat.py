#!/usr/bin/env python3
"""Windows compatibility utilities for ClaudeKit scripts.

Provides UTF-8 encoding support for Windows console (cp1252).
Import this module early in scripts that output Unicode content.

Usage:
    # At top of script, after imports:
    from win_compat import safe_print, ensure_utf8_stdout

    # Option 1: Wrap stdout globally (recommended for scripts with many prints)
    ensure_utf8_stdout()
    print("Unicode content: emojis, symbols, etc.")

    # Option 2: Use safe_print for individual calls
    safe_print("Unicode content: emojis, symbols, etc.")
"""

import sys

_stdout_wrapped = False


def ensure_utf8_stdout():
    """Wrap sys.stdout to use UTF-8 encoding on Windows.

    Safe to call multiple times - only wraps once.
    Call this early in script execution, before any print() calls.
    """
    global _stdout_wrapped
    if _stdout_wrapped:
        return

    if sys.platform == 'win32':
        import io
        # Only wrap if stdout has a buffer (not already wrapped)
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    _stdout_wrapped = True


def safe_print(text):
    """Print with Unicode fallback for Windows cp1252 console.

    Use this for individual print calls when you can't wrap stdout globally.
    Falls back to replacing unencodable characters with '?'.

    Args:
        text: String to print (can contain any Unicode characters)
    """
    try:
        print(text)
    except UnicodeEncodeError:
        # Fallback: replace unencodable chars
        encoding = getattr(sys.stdout, 'encoding', 'utf-8') or 'utf-8'
        print(text.encode(encoding, errors='replace').decode(encoding))
