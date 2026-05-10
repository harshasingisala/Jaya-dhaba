import os
import uuid
import imghdr
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'glb', 'usdz'}
ALLOWED_MIMETYPES = {'image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'} # octet-stream for 3D models


def allowed_file(filename: str) -> bool:
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_secure_file(file: FileStorage, upload_folder: str) -> str:
    """
    Renames file to UUID, checks magic bytes, and saves it.
    Returns the relative path.
    """
    if not file or not allowed_file(file.filename):
        raise ValueError("Invalid file type")

    # Rename to UUID to prevent name collisions and path traversal
    ext = file.filename.rsplit('.', 1)[1].lower()
    new_filename = f"{uuid.uuid4()}.{ext}"
    
    # Ensure folder exists
    os.makedirs(upload_folder, exist_ok=True)
    
    file_path = os.path.join(upload_folder, new_filename)
    file.save(file_path)
    
    # Magic Byte Check for images
    if ext in {'png', 'jpg', 'jpeg', 'webp'}:
        img_type = imghdr.what(file_path)
        if not img_type:
            os.remove(file_path)
            raise ValueError("Invalid image content")
            
    return new_filename
