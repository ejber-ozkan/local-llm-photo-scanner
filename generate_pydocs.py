import os
import sys
import subprocess

def generate_docs():
    """Generates Python documentation using pydoc."""
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
    
    print("Generating pydocs for the backend...")
    
    # Switch to backend directory to resolve local imports properly
    os.chdir(backend_dir)
    
    docs_dir = os.path.join(os.path.dirname(backend_dir), "docs")
    if not os.path.exists(docs_dir):
        os.makedirs(docs_dir)
        
    try:
        # Generate html documentation using built-in pydoc
        subprocess.run([sys.executable, "-m", "pydoc", "-w", "photo_backend"], check=True)
        
        # Move generated html to docs folder
        html_file = "photo_backend.html"
        if os.path.exists(html_file):
            target_path = os.path.join(docs_dir, html_file)
            if os.path.exists(target_path):
                os.remove(target_path)
            os.rename(html_file, target_path)
            print(f"Documentation successfully generated at: {target_path}")
        else:
            print("Failed to find generated HTML documentation.")
    except Exception as e:
        print(f"Error generating documentation: {e}")

if __name__ == "__main__":
    generate_docs()
