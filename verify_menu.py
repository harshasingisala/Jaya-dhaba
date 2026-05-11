import requests
r = requests.get('http://localhost:5000/api/menu')
data = r.json()
print('Menu items prices (should be in RUPEES now):')
for item in data['items'][:5]:
    print(f"  {item['name']}: ₹{item['price']}")
print('\nTest verification:')
print(f"  Chicken 65: ₹{data['items'][0]['price']} (expected ₹299)")
print(f"  Test Item 1 RS: found = {any(item['name'] == 'Test Item 1 RS' for item in data['items'])}")
if any(item['name'] == 'Test Item 1 RS' for item in data['items']):
    test_item = next(item for item in data['items'] if item['name'] == 'Test Item 1 RS')
    print(f"  Test Item 1 RS price: ₹{test_item['price']} (expected ₹1)")
