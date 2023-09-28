"""
Search text in all files within project. Search text with match whole word mode.
"""

import sys
import os
import fnmatch
import re

def search_text(text, include_files=None, exclude_files=None):
    """
    Search text in all files within project. Search text with match whole word mode.
    """
    # Get the current working directory
    cwd = os.getcwd()

    # Prepare the include and exclude patterns
    include_patterns = include_files.split(',') if include_files else ['*']
    exclude_patterns = exclude_files.split(',') if exclude_files else []

    # Initialize a flag to check if the text is found
    found = 0

    # Walk through the directory
    search_result = []
    for dirpath, dirnames, filenames in os.walk(cwd):
        for filename in filenames:
            filename = os.path.join(dirpath, filename)
            relFileName = os.path.relpath(filename, cwd)
            # Check if the file matches any of the include patterns
            if any(fnmatch.fnmatch(relFileName, pattern) for pattern in include_patterns):
                # Check if the file matches any of the exclude patterns
                if not any(fnmatch.fnmatch(relFileName, pattern) for pattern in exclude_patterns):
                    # Open the file and search for the text
                    try:
                        with open(filename, 'r') as file:
                            for line_no, line in enumerate(file, 1):
                                if re.search(r'\b' + re.escape(text) + r'\b', line):
                                    search_result.append(f'Found "{text}" in file {relFileName} on line {line_no-1}: {line.strip()}')
                                    found += len(line.strip())
                                    if (len(search_result) > 100 or found > 5000):
                                        sys.stderr.write("The search text is too long, try to shorten it.\n")
                                        sys.exit(1)
                    except Exception:
                        pass

    # Check if the text was found
    if found == 0:
        sys.stderr.write("Optimize the search text content, make sure the search text exists in the file.\n")
        sys.exit(1)
    # Print the result
    print('\n'.join(search_result))
        

def main():
    # Get the arguments from the command line
    text = sys.argv[1]
    include_files = sys.argv[2] if sys.argv[2] != '${include_files}' else None
    exclude_files = sys.argv[3] if sys.argv[3] != '${exclude_files}' else None

    # Call the search_text function
    search_text(text, include_files, exclude_files)
    sys.exit(0)

if __name__ == "__main__":
    main()