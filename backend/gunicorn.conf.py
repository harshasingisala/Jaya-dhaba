from pathlib import Path
import runpy

globals().update(runpy.run_path(str(Path(__file__).with_name("gunicorn.config.py"))))
