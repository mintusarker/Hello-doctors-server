const express = require("express");
const cors = require("cors");
const {
  MongoClient,
  ServerApiVersion,
  deserialize,
  ObjectId,
} = require("mongodb");
var jwt = require("jsonwebtoken");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// console.log(stripe);

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
  },
});

// JWT function
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorize access");
  }
  const token = authHeader.split(" ")[1];
  // console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    // await client.connect();

    const appointmentCollections = client
      .db("HelloDoctors")
      .collection("options");
    const bookingCollections = client.db("HelloDoctors").collection("bookings");
    const userCollections = client.db("HelloDoctors").collection("users");
    const doctorsCollections = client.db("HelloDoctors").collection("doctors");
    const paymentCollections = client.db("HelloDoctors").collection("payments");

    // //verify Admin
    // const verifyAdmin = (req, res, next) => {
    //     const decodedEmail = req.decoded.email;
    //     console.log('email', decodedEmail);
    // }

    app.get("/appointmentOptions", async (req, res) => {
      const query = {};
      const options = await appointmentCollections.find(query).toArray();

      const date = req.query.date;
      const booking = { appointmentDate: date };
      const alreadyBooked = await bookingCollections.find(booking).toArray();

      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookSlots = optionBooked.map((book) => book.slot);
        // console.log(bookSlots);
        const remainingSlots = option.slots.filter(
          (slot) => !bookSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    //bookings
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingCollections.find(query).toArray();
      if (alreadyBooked.length) {
        const text = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, text });
      }
      const result = await bookingCollections.insertOne(booking);
      res.send(result);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await bookingCollections.find(query).toArray();
      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollections.findOne(query);
      res.send(result);
    });

    app.delete("/bookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await bookingCollections.deleteOne(filter);
      res.send(result);
    });

    // stripe payment
    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //payment store database
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollections.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updateResult = await bookingCollections.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    // jwt
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const query = { email: email };
      console.log(query);
      const user = await userCollections.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        return res.status(403).send({ accessToken: token });
      }
      res.send({ accessToken: "" });
    });

    // //save user
    // app.post("/users", async (req, res) => {
    //   const user = req.body;
    //   const result = await userCollections.insertOne(user);
    //   res.send(result);
    // });

    // save users
    app.put("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const email = user.email;
      const filter = { email: email };
      const options = { upsert: true };
      const obj = {
        email: user.email,
        name: user.name,
      };
      console.log(obj);
      const updateDoc = { $set: obj };
      const result = await userCollections.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //get user
    app.get("/users", async (req, res) => {
      const query = {};
      const result = await userCollections.find(query).toArray();
      res.send(result);
    });

    //delete user
    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollections.deleteOne(filter);
      res.send(result);
    });

    //  get admin email
    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollections.findOne(query);
      const admin = user?.role === "Admin";
      res.send({ isAdmin: admin });
    });

    // status update Make Admin
    app.put("/user/admin/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollections.findOne(query);

      if (user?.role !== "Admin") {
        const text = `${user?.name} is not eligible to make admin some one `;
        return res.send({ text });
      }
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await userCollections.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // // temporary update price
    // app.get('/addPrice', async (req, res) => {
    //     const filter = {};
    //     const option = { upsert: true };
    //     const updateDoc = {
    //         $set: {
    //             price: 399
    //         }
    //     }
    //     const result = await appointmentCollections.updateMany(filter, updateDoc, option);
    //     res.send(result);
    // });

    //doctors specialty
    app.get("/specialty", async (req, res) => {
      const query = {};
      const result = await appointmentCollections
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    //save doctors
    app.post("/doctors", verifyJWT, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollections.insertOne(doctor);
      res.send(result);
    });

    // get doctors
    app.get("/doctors", async (req, res) => {
      const query = {};
      const result = await doctorsCollections.find(query).toArray();
      res.send(result);
    });

    //delete doctors
    app.delete("/doctors/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await doctorsCollections.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("server running");
});

app.listen(port, () => console.log(`server running on ${port}`));
