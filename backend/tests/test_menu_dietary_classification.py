import pytest

from routes.menu import _dietary_classification


@pytest.mark.parametrize(
    ("name", "category", "tags", "expected"),
    [
        ("Veg. Clear Soup", "Veg & Non Veg Soups", [], True),
        ("Chk. Clear Soup", "Veg & Non Veg Soups", [], False),
        ("Chilli Paneer", "Starters Veg", [], True),
        ("Chicken 65", "Starters Non Veg", [], False),
        ("House Curry", "Non Veg Curries", [], False),
        ("Mystery Special", "Chef Specials", [], None),
        ("House Special", "Chef Specials", ["Veg"], True),
        ("House Special", "Chef Specials", ["Non-Veg"], False),
    ],
)
def test_dietary_classification_uses_reliable_menu_signals(name, category, tags, expected):
    row = {"name": name, "category_name": category}

    assert _dietary_classification(row, tags) is expected
