def validate_lengths(**fields):
    limits = {
        "name": 100,
        "email": 200,
        "phone": 20,
        "message": 2000,
        "subject": 200,
        "password": 128,
    }
    for field, value in fields.items():
        if value and field in limits and len(str(value)) > limits[field]:
            return False, f"{field} is too long"
    return True, None
