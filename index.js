const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_METHOD_SECRET);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.et32bhj.mongodb.net/?retryWrites=true&w=majority`;

// JWT middleware, verify JWT
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  //   console.log(authorization);
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized acess" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized acess" });
    }
    // console.log(decoded);
    req.decoded = decoded;
    next();
  });
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const classCollection = client.db("teachingDB").collection("classes");
    const selectedCollection = client.db("teachingDB").collection("selected");
    const userCollection = client.db("teachingDB").collection("users");
    const paymentCollection = client.db("teachingDB").collection("payments");

    // sign jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      //   console.log("admin", email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // verify Instructor middleware
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      //   console.log("instructor", email);
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // --------- Class Related API Start ---------------
    // get all classes
    app.get("/classes", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    // get classes by email wise
    app.get("/classes/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    // get only approved class
    app.get("/approvedclass", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection
        .find(query)
        .sort({ enrolled: -1 })
        .toArray();
      res.send(result);
    });

    // popularClass only 6 item
    app.get("/popularclass", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection
        .find(query)
        .sort({ enrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // post student selected class
    app.post("/selected", async (req, res) => {
      const selected = req.body;
      const result = await selectedCollection.insertOne(selected);
      res.send(result);
    });

    // get all selected class
    app.get("/selected", async (req, res) => {
      const result = await selectedCollection.find().toArray();
      res.send(result);
    });

    // get spesific class by id
    app.get("/select/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.findOne(query);
      res.send(result);
    });

    // get selected class by email
    app.get("/selected/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });

    // all pending class
    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    // set pending status to approved
    app.patch("/classe/approved/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: "approved",
        },
      };
      const result = await classCollection.updateOne(query, updateStatus);
      res.send(result);
    });

    // set pending status to denied
    app.patch("/classe/denied/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: "denied",
        },
      };
      const result = await classCollection.updateOne(query, updateStatus);
      res.send(result);
    });

    app.put("/feedback/:id", async (req, res) => {
      const body = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateFeedback = {
        $set: {
          feedback: body.feedback,
        },
      };
      const result = await classCollection.updateOne(
        filter,
        updateFeedback,
        options
      );
      res.send(result);
    });

    // ------------ Uer Related API Start ------------

    // when user sign up first time, user information save in database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "member already exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get all user(only admin can manage this route)
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // get only instructors
    app.get("/instructors", async (req, res) => {
      const query = { role: "instructor" };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/selected/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
    });

    //  check current user admin or not
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      //   console.log("decoded", decodedEmail, "email", email);
      if (email !== decodedEmail) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //  check current user instructor or not
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      //   console.log("decoded", decodedEmail, "email", email);
      if (email !== decodedEmail) {
        return res.send({ instructor: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    // set a role for admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // set a role for instructor
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // ------------ Payment Related API Start -----------

    // payment intant
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // post payment collection
    app.post("/payment", verifyJWT, async (req, res) => {
      const payment = req.body;
      payment.date = new Date();
      const id = payment.selecteItemId;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: new ObjectId(id) };
      const removeClass = await selectedCollection.deleteOne(query);
      res.send({ insertResult, removeClass });
    });

    app.get("/payment", verifyJWT, async (req, res) => {
      const { date } = req.body;
      const email = req.query.email;
      const filter = { email: email };
      const result = await paymentCollection
        .find(filter)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // update available seat and enrolled
    app.put("/updateClass/:id", async (req, res) => {
      const id = req.params.id;
      const { availableSeats, enrolled } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          availableSeats: availableSeats,
          enrolled: enrolled,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Teaching server is running");
});

app.listen(port, () => {
  console.log(`Teaching server is running on port ${port}`);
});
