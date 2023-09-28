"""
Create new file.
arg: 
	content: current file name with content
    fileName: new file name.
Rename content to fileName.
"""

import os
import sys
import shutil

def create_new_file(content_file, new_file):
    """
    Create new file or replace file with new content.
    """
    try:
        if os.path.exists(new_file):
            os.remove(new_file)
        # Create the parent directories for the new file if they don't exist.
        os.makedirs(os.path.dirname(new_file), exist_ok=True)
        
        shutil.move(content_file, new_file)
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    content_file = sys.argv[1]
    new_file = sys.argv[2]
    create_new_file(content_file, new_file)
    sys.exit(0)
