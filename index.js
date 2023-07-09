const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.dl1tykd.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const appointmentCollections = client.db("HelloDoctors").collection('options');
        const bookingCollections = client.db("HelloDoctors").collection('bookings')


        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date
            const query = {};
            const options = await appointmentCollections.find(query).toArray();
            const booking = { appointmentDate: date }
            const alreadyBooked = await bookingCollections.find(booking).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookSlots = optionBooked.map(book => book.slot)
                console.log(bookSlots);
                
            })
            res.send(options);
        });


        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const result = await bookingCollections.insertOne(booking);
            res.send(result);
        })


    } finally {

    }
}
run().catch(console.dir);





app.get('/', async (req, res) => {
    res.send('server running')
})


app.listen(port, () => console.log(`server running on ${port}`))