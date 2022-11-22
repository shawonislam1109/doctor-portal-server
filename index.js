const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const stripe = require('stripe')("sk_test_51M64lQDVUwYv6NIUbybVHNY4LnbJNqKChQK0MttoDDSE1tZymD7ojchg2XanhCm1T0dcUtXOF9Ms5GeIMdNspHrr0045vd8jja")
require('dotenv').config();
const port = process.env.PORT || 5000;


// middleware 

app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
    res.send('this sever is connected')
})

const BDuser = process.env.BD_user
const BDpassword = process.env.BD_password


const uri = `mongodb+srv://${BDuser}:${BDpassword}@cluster0.5rnuhbi.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function jwtVerify(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access')
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        const appointmentOptionUser = client.db('doctorPortal').collection('appointmentOption');
        const bookingsCollections = client.db('doctorPortal').collection('bookings');
        const userCollections = client.db('doctorPortal').collection('users');
        const doctorsCollections = client.db('doctorPortal').collection('doctors');
        const paymentCollections = client.db('doctorPortal').collection('payment');

        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userCollections.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        app.get('/appointmentOption', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionUser.find(query).toArray();
            const bookingQuery = { selectedDate: date };
            const alreadyBooked = await bookingsCollections.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookSlot = optionBooked.map(book => book.slot);
                const remainingSlot = option.slots.filter(slot => !bookSlot.includes(slot))
                option.slots = remainingSlot;
            })
            res.send(options)
        })

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appointmentOptionUser.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })

        app.post('/bookings', async (req, res) => {
            const query = req.body;
            const bookings = await bookingsCollections.insertOne(query);
            res.send(bookings);
        })
        app.get('/bookings', async (req, res) => {
            const query = {};
            const bookings = await bookingsCollections.find(query).toArray();
            res.send(bookings)
        })

        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await bookingsCollections.findOne(query);
            res.send(result);
        })
        app.get('/booking', jwtVerify, async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const result = await bookingsCollections.find(query).toArray();
            res.send(result)
        })

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const payment = booking.price;
            const price = 100 * payment;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: price,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollections.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10h' });
                return res.send({ accessToken: token })
            }
            res.status(403).send({ accessToken: 'token' })
        })

        app.get('/users/:id', async (req, res) => {
            const id = req.query.id
            const query = { _id: ObjectId(id) };
            const result = await userCollections.findOne(query);
            res.send(result);
        })

        app.get('/users', async (req, res) => {
            const users = {};
            const result = await userCollections.find(users).toArray();
            res.send(result);
        })
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollections.findOne(query);
            res.send({ isAdmin: user?.role == 'admin' });
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user)
            const result = await userCollections.insertOne(user);
            res.send(result);
        })

        app.delete('/users/:id', async (req, res) => {
            const id = req.query.id;
            const user = { _id: ObjectId(id) };
            const result = await userCollections.deleteOne(user);
            res.send(result);
        })

        app.put('/users/admin/:id', jwtVerify, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollections.updateOne(filter, updateDoc, options);
            res.send(result);
        })
        app.get('/addPrice', async (req, res) => {
            const filter = {};
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    price: 100
                }
            }
            const result = await appointmentOptionUser.updateMany(filter, updateDoc, options)
            res.send(result);
        })

        app.get('/doctors', jwtVerify, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollections.find(query).toArray();
            res.send(doctors);
        })
        app.get('/payment', async (req, res) => {
            const query = {}
            const payment = await paymentCollections.find(query).toArray();
            res.send(payment);
        })
        app.post('/doctors', jwtVerify, verifyAdmin, async (req, res) => {
            const query = req.body;
            const doctors = await doctorsCollections.insertOne(query);
            res.send(doctors);
        })
        app.post('/payment', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollections.insertOne(payment);
            res.send(result)
        })


        app.delete('/doctors/:id', jwtVerify, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const doctors = await doctorsCollections.deleteOne(query);
            res.send(doctors);
        })

    }
    finally {

    }
}

run().catch(error => console.log(error))


app.listen(port, () => {
    console.log(`this port is the connected is ${port}`)
})