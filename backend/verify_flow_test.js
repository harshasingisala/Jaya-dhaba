const axios = require('axios');

async function testBooking() {
    const baseURL = 'http://localhost:5000';
    
    try {
        console.log('--- Phase 1: Authentication ---');
        // Registering a dev user
        const authRes = await axios.post(`${baseURL}/api/auth/firebase`, {
            email: 'testuser@example.com',
            uid: 'test_uid_123',
            name: 'Test User'
        });
        const token = authRes.data.token;
        console.log('✅ Auth Token received');

        const headers = { Authorization: `Bearer ${token}` };

        console.log('\n--- Phase 2: Create Order (Mock) ---');
        const orderRes = await axios.post(`${baseURL}/api/booking/create-order`, {
            seat: 'A-15',
            eventId: '67a716c5b96790a18e000001' // Assuming this ID exists from your logs/seed
        }, { headers });
        console.log('✅ Order Created:', orderRes.data);

        console.log('\n--- Phase 3: Verify Payment (Mock) ---');
        const verifyRes = await axios.post(`${baseURL}/api/booking/verify-payment`, {
            razorpay_order_id: orderRes.data.id || 'order_mock_123',
            razorpay_payment_id: 'pay_mock_999',
            razorpay_signature: 'mock_signature',
            seat: 'A-15',
            eventId: '67a716c5b96790a18e000001',
            name: 'Test User',
            branch: 'CSE',
            year: '3rd',
            pin: '22A31A0501'
        }, { headers });
        console.log('✅ Payment Verified:', verifyRes.data);

        if (verifyRes.data.bookingId) {
            console.log('\n--- Phase 4: Fetch Pass ---');
            const passRes = await axios.get(`${baseURL}/api/booking/user/pass/${verifyRes.data.bookingId}`, { headers });
            console.log('✅ Pass Loaded:', passRes.data);
            console.log('\n🎉 FULL FLOW SUCCESS!');
        } else {
            console.log('❌ Booking ID missing in response');
        }

    } catch (err) {
        console.error('❌ Test Failed:', err.response ? err.response.data : err.message);
    }
}

testBooking();
