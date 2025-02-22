import os

def combine_files_in_directory(output_file="combined_output.txt", ignore_dirs=None):
    """
    Combines all files in the current directory (recursively) into a single output file.
    The file names are recorded before their contents.
    Directories in `ignore_dirs` will be skipped.
    """
    if ignore_dirs is None:
        ignore_dirs = ["venv", "node_modules"]  # Default to ignoring 'venv'

    with open(output_file, "w", encoding="utf-8") as outfile:
        for root, dirs, files in os.walk(os.getcwd()):
            # Modify the dirs list in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r", encoding="utf-8") as infile:
                        # Write the file name and a separator
                        outfile.write(f"--- {file_path} ---\n")
                        # Write the file content
                        outfile.write(infile.read())
                        outfile.write("\n\n")
                except Exception as e:
                    # Log an error if a file couldn't be read
                    outfile.write(f"--- {file_path} (ERROR: {e}) ---\n\n")

if __name__ == "__main__":
    combine_files_in_directory()