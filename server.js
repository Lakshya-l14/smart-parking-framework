const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error("Database initialization fault:", err.message);
    else console.log("SQLite database layer active.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        latitude REAL,
        longitude REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER,
        slot_number TEXT,
        status TEXT DEFAULT 'Available',
        FOREIGN KEY(location_id) REFERENCES locations(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_id INTEGER,
        user_name TEXT,
        vehicle_number TEXT,
        payment_status TEXT,
        transaction_id TEXT,
        status TEXT DEFAULT 'Active',
        FOREIGN KEY(slot_id) REFERENCES slots(id)
    )`);

    // Seed Data: Populate the 5 Bangalore hubs along with their real-world GPS coordinates
    const places = [
        { name: 'Avenue Road', lat: 12.9719, lng: 77.5794 },
        { name: 'Church Street', lat: 12.9750, lng: 77.6068 },
        { name: 'Indira Nagar', lat: 12.9784, lng: 77.6408 },
        { name: 'Whitefield', lat: 12.9698, lng: 77.7500 },
        { name: 'Tin Factory', lat: 13.0040, lng: 77.6749 }
    ];

    places.forEach(place => {
        db.run(`INSERT OR IGNORE INTO locations (name, latitude, longitude) VALUES (?, ?, ?)`, 
        [place.name, place.lat, place.lng], function(err) {
            if (!err && this.changes > 0) {
                for (let i = 1; i <= 6; i++) {
                    db.run(`INSERT INTO slots (location_id, slot_number, status) VALUES (?, ?, 'Available')`, [this.lastID, `Slot-A${i}`]);
                }
            }
        });
    });
});

app.get('/api/locations', (req, res) => {
    db.all(`SELECT * FROM locations`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/slots/:locationId', (req, res) => {
    db.all(`SELECT * FROM slots WHERE location_id = ?`, [req.params.locationId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/book', (req, res) => {
    const { slotId, userName, vehicleNumber, cardNumber } = req.body;
    if (!slotId || !userName || !vehicleNumber || !cardNumber) {
        return res.status(400).json({ success: false, message: "Error: Missing entries!" });
    }
    if (cardNumber.length < 16) {
        return res.status(400).json({ success: false, message: "Payment Denied: Invalid Card Input." });
    }

    const txId = 'TXN-' + Math.floor(Math.random() * 900000 + 100000);

    db.serialize(() => {
        db.get(`SELECT status FROM slots WHERE id = ?`, [slotId], (err, row) => {
            if (row && row.status !== 'Available') return res.json({ success: false, message: "Slot already taken." });

            db.run(`UPDATE slots SET status = 'Occupied' WHERE id = ?`, [slotId]);
            db.run(`INSERT INTO bookings (slot_id, user_name, vehicle_number, payment_status, transaction_id, status) VALUES (?, ?, ?, 'Paid', ?, 'Active')`,
            [slotId, userName, vehicleNumber, txId], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, message: "Booking confirmed! Slot allocated.", transactionId: txId });
            });
        });
    });
});

app.get('/api/bookings', (req, res) => {
    const query = `
        SELECT bookings.id as booking_id, bookings.user_name, bookings.vehicle_number, bookings.transaction_id,
               slots.slot_number, locations.name as location_name, locations.latitude, locations.longitude
        FROM bookings
        JOIN slots ON bookings.slot_id = slots.id
        JOIN locations ON slots.location_id = locations.id
        WHERE bookings.status = 'Active'
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cancel', (req, res) => {
    const { bookingId } = req.body;
    db.get(`SELECT slot_id FROM bookings WHERE id = ?`, [bookingId], (err, row) => {
        if (err || !row) return res.status(404).json({ success: false, message: "Record missing." });
        const slotId = row.slot_id;
        db.serialize(() => {
            db.run(`UPDATE slots SET status = 'Available' WHERE id = ?`, [slotId]);
            db.run(`UPDATE bookings SET status = 'Cancelled' WHERE id = ?`, [bookingId], (err) => {
                if (err) return res.json({ success: false, error: err.message });
                res.json({ success: true, message: "Booking canceled. Slot freed successfully." });
            });
        });
    });
});

app.listen(PORT, () => console.log(`Smart Parking Server running at http://localhost:${PORT}`));