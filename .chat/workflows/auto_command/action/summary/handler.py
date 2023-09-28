"""
"""

import os
import sys
from chat.ask_codebase.indexing.loader.file import FileMetadata, FileSource, simple_file_filter
from chat.ask_codebase.indexing.module_summary import SummaryWrapper

def desc(repo_dir: str, repo_cache_path: str, target_path: str):
    """
    """
    target_path = target_path.replace(repo_dir, '') 
    sw = SummaryWrapper(repo_cache_path, FileSource(
        path=repo_dir,
        rel_root=repo_dir,
        file_filter=simple_file_filter,
    ))
    return sw.get_desc(target_path)


def summary():
    """
    Get file or directory 's summary
    """
    try:
        repo_dir = os.getcwd()
        repo_cache_path = os.path.join(repo_dir, '.chat', '.summary.json')
    
        target_path = sys.argv[1]
        return desc(repo_dir, repo_cache_path, target_path)
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    print(summary())
    sys.exit(0)