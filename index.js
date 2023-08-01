const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, deserialize, ObjectId } = require('mongodb');
var jwt = require('jsonwebtoken');
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

// JWT function
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorize access')
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
};

async function run() {
    try {
        const appointmentCollections = client.db("HelloDoctors").collection('options');
        const bookingCollections = client.db("HelloDoctors").collection('bookings')
        const userCollections = client.db("HelloDoctors").collection('users')


        app.get('/appointmentOptions', async (req, res) => {
            const query = {};
            const options = await appointmentCollections.find(query).toArray();

            const date = req.query.date;
            const booking = { appointmentDate: date }
            const alreadyBooked = await bookingCollections.find(booking).toArray();

            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookSlots = optionBooked.map(book => book.slot);
                // console.log(bookSlots);
                const remainingSlots = option.slots.filter(slot => !bookSlots.includes(slot));
                option.slots = remainingSlots;
            })
            res.send(options);
        });


        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            };
            const alreadyBooked = await bookingCollections.find(query).toArray()
            if (alreadyBooked.length) {
                const text = `You already have a booking on ${booking.appointmentDate}`
                return res.send({ acknowledged: false, text })
            }
            const result = await bookingCollections.insertOne(booking);
            res.send(result);
        });


        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const result = await bookingCollections.find(query).toArray();
            res.send(result)
        });


        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollections.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
                res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: '' })
        })

        //save user
        app.post('/users', async (req, res) => {
            const query = req.body;
            const result = await userCollections.insertOne(query);
            res.send(result)
        });


        app.get('/users', async (req, res) => {
            const query = {};
            const result = await userCollections.find(query).toArray();
            res.send(result);
        });


        app.delete('/user/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await userCollections.deleteOne(filter);
            res.send(result);
        })

        // status update Make Admin
        app.put('/user/admin/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail }
            const user = await userCollections.findOne(query)

            if (user?.role !== "Admin") {
                const text = `${user?.name} is not eligible to make admin some one `
                return res.send({text} )
            }
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    role: 'Admin'
                }
            }
            const result = await userCollections.updateOne(filter, updateDoc, options);
            res.send(result)
        });



    } finally {

    }
}
run().catch(console.dir);





app.get('/', async (req, res) => {
    res.send('server running')
})


app.listen(port, () => console.log(`server running on ${port}`))