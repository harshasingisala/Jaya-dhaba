const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/feedx';

const cleanup = async () => {
    try {
        console.log(`Connecting to ${MONGO_URI}...`);
        // Remove deprecated options for newer mongoose
        await mongoose.connect(MONGO_URI);
        const collection = mongoose.connection.collection('users');

        console.log('Fetching indexes...');
        const indexes = await collection.indexes();
        console.log('Current indexes:');
        indexes.forEach(idx => {
            console.log(` - Name: ${idx.name}`);
            console.log(`   Key: ${JSON.stringify(idx.key)}`);
            if (idx.unique) console.log(`   Unique: true`);
        });

        const pinIndex = indexes.find(idx => idx.name === 'pin_1');
        if (pinIndex) {
            console.log('Attempting to drop pin_1 index...');
            await collection.dropIndex('pin_1');
            console.log('✅ Index pin_1 dropped successfully!');
        } else {
            console.log('⚠️ Index pin_1 not found.');
        }

        console.log('Final Index List:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach(idx => console.log(` - ${idx.name}`));

        await mongoose.connection.close();
        console.log('Done.');
    } catch (err) {
        console.error('❌ Error during cleanup:', err);
        process.exit(1);
    }
};

cleanup();
