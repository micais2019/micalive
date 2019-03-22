// Based on the original Welcome to Glitch web app.

// server.js
// where your node app starts

// set up express (the web service framework powering this app https://expressjs.com/)
var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
var bodyParser = require('body-parser');
var mqtt = require('mqtt');
var SocketCollection = require('./socket_collection')

var Datastore = require('nedb'),
    // Security note: the database is saved to the file `datafile` on the local filesystem.
    // It's deliberately placed in the `.data` directory which doesn't get copied if
    // someone remixes the project.
    db = new Datastore({ filename: '.data/datafile', autoload: true });

// POST requests should unpack form data
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// get IO user, key, and feed from .env file
var IO_USERNAME = process.env.IO_USERNAME
var IO_KEY = process.env.IO_KEY

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));
app.set('view engine', 'hbs');

//////////////////// MQTT

var client = mqtt.connect('mqtts://io.adafruit.com', { username: IO_USERNAME, password: IO_KEY })

client.on('connect', function () {
  let topic = IO_USERNAME + "/dashboard/stream/create"

  client.subscribe(topic, function (err) {
    console.log("mqtt connected and subscribed: ", topic)
  })
})

var lastValues = {}

client.on('message', function (topic, message) {
  // message is Buffer
  const data = JSON.parse(message.toString())

  const fwd = () => {
    console.log("[MQTT]", topic, message.toString())
    sockets.onMessage(JSON.stringify({
      id: data.id,
      value: data.value,
      key: data.feed_key,
      created_at: data.created_at
    }))
  }

  db.update({ key: data.feed_key }, {$set: {value: data.value, created_at: data.created_at}}, function (err, n) {
    if (n === 0) {
      db.insert({ key: data.feed_key, value: data.value, created_at: data.created_at })
    }
    fwd()
  })
})

//////////////////// END MQTT



//////////////////// WEBSOCKET

var sockets = new SocketCollection()
app.ws('/streaming', function(ws, req) {
  console.log("got client connection")
  sockets.addConnection(ws)

  db.find({}, function (err, feeds) { // Find all values in the collection
    console.log("found", feeds.length, "feeds")

    feeds.forEach(function(feed) {
      ws.send(JSON.stringify({
        key: feed.key,
        value: feed.value,
        created_at: feed.created_at,
        mode: "reconnect"
      }))
    })
  })
})

//////////////////// END WEBSOCKET



// This route sends the homepage
app.get("/", function (req, res) {
  res.render('index', {
    WS_URL: process.env.WS_URL
  })
});


// start listening for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
