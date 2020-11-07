const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ejsMate = require('ejs-mate');
const methodOverride = require('method-override');
const ExpressError = require('./utils/ExpressError');
const flash = require('connect-flash');
const session = require('express-session')
const passport = require('passport')
var cors = require('cors')
const User = require('./models/user')
const Job = require('./models/jobs')
const Host = require('./models/admin')
const Message = require('./models/message')
const corsAllow = require('./routes/cors');
const accomodateRoute = require('./routes/accomodate');

var request = require('request');

var headers = {
    'webpushrKey': '0b0564d7baaab3d16b01d9d9000c42b0',
    'webpushrAuthToken': '17179',
    'Content-Type': 'application/json'
};
const LocalStrategy = require('passport-local')
const mongoSanitize = require('express-mongo-sanitize');




//login route
const userRoutes = require('./routes/users')
const jobRoutes = require('./routes/jobs')
const MongoDBStore = require("connect-mongo")(session);

const dbUrl = 'mongodb+srv://sans:bowbow@codefury.gkzbe.mongodb.net/codefury?retryWrites=true&w=majority';
//const dbUrl = 'mongodb://localhost:27017/codefuryyy' ; 


mongoose.connect(dbUrl, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    useFindAndModify: false
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

const app = express();
//app.use(cors())
//CORS middleware
app.use(function (req, res, next) {
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type, Accept,Authorization,Origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Credentials", true);
    next();
});


app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'))


var http = require("http").Server(app);
var io = require("socket.io")(http);

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public'))); //used as one of  boilerplate scripts
app.use(mongoSanitize({
    replaceWith: '_' //not necessary 
}))

const secret = 'thisshouldbeabettersecret!';

const store = new MongoDBStore({
    url: dbUrl,
    secret,
    touchAfter: 24 * 60 * 60
});

store.on("error", function (e) {
    console.log("SESSION STORE ERROR", e)
})

const sessionConfig = {
    name: 'session',
    secret, //change this later ..
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}
app.use(session(sessionConfig));
app.use(flash());


app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})

app.use('/', userRoutes);
app.use('/', jobRoutes);
app.use('/', accomodateRoute);
// -----------------------------------


app.get('/', corsAllow.corsWithOptions, (req, res) => {
    Host.find({}, function (err, found) {
        //console.log(found)
        if (err) console.log(err)
        else res.render('home', { categories: found[0].categories, search: false })

    })

});

app.get('/search-job', corsAllow.corsWithOptions, (req, res) => {
    Job.find({ city: req.query.address }, function (err, val) {
        Host.find({}, function (err, found) {
            if (err) console.log(err)
            else res.render('home', { categories: found[0].categories, search: true, jobs: val })
        })
    })
})

app.get('/apply', corsAllow.corsWithOptions, (req, res) => {
    Job.find({ _id: req.query.jobid }, function (err, val) {

        if (err) console.log(err)
        else res.render('apply', { jobs: val[0] })

    })
})

io.on("connection", () => {
    console.log("a user is connected")
})

app.get('/messages', corsAllow.corsWithOptions, (req, res) => {

    Message.find({ userid: req.query.id }, (err, messages) => {
        if (err) res.send(err)
        else res.send(messages);
    })


})

app.post('/messages/:id/:name', corsAllow.corsWithOptions, (req, res) => {

    var message = new Message({ name: req.params.name, message: req.body.message, userid: req.params.id });
    message.save((err) => {
        if (err)
            sendStatus(500);
        io.emit('message', message);
        res.sendStatus(200);
    })
})


app.post('/apply/:user', corsAllow.corsWithOptions, (req, res) => {

    Job.find({ _id: req.body.id }, (err, job) => {
        User.updateOne({ _id: req.params.user }, {
            $set: {
                appliedTo: job[0].userid,
                toJobId: req.body.id
            }
        }, function (err, res) {
            if (err)
                console.log(err)
        }
        )
        User.updateOne({ _id: job[0].userid }, {
            $set: {
                appliedBy: req.params.user,
                byJobId: req.body.id
            }
        }, function (err, res) {
            if (err)
                console.log(err)
        })



        User.find({ _id: job[0].userid }, function (error, user) {
            var sid = user[0].sid
            var data = { "title": "Your request has been accepted!", "message": "notification message", "target_url": "https://www.webpushr.com", "sid": `${sid}` };
            var dataString = JSON.stringify(data);
            var options = {
                url: 'https://api.webpushr.com/v1/notification/send/sid',
                method: 'POST',
                headers: headers,
                body: dataString
            };

            function callback(error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body);
                }
            }

            request(options, callback);
        })

    })
})

app.post('/cancel/:user', corsAllow.corsWithOptions, (req, res) => {

    Job.find({ _id: req.body.id }, (err, job) => {
        User.updateOne({ _id: req.params.user }, {
            $set: {
                appliedTo: null,
                toJobId: null,
            }
        }, function (err, res) {
            if (err)
                console.log(err)
        }
        )
        User.updateOne({ _id: job[0].userid }, {
            $set: {
                appliedBy: null,
                byJobId: null,
            }
        }, function (err, res) {
            if (err)
                console.log(err)
        })
    })
})

app.post('/sid/:user', corsAllow.corsWithOptions, (req, res) => {
    User.updateOne({ _id: req.params.user }, {
        $set: {
            sid: req.body.sid,
        }
    }, function (err, res) {
        if (err)
            console.log(err)
    })
})



// -----------------------------------


app.all('*', (req, res, next) => {
    next(new ExpressError('Page Not Found', 404))
})


app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = "Something Doesn't Seem right!!";
    res.status(statusCode).render('error', { err })
});

const port = process.env.PORT || 3000;

var server = http.listen(port, () => {
    console.log('server is running on port', server.address().port);
});

// app.listen(port, () => {
//     console.log(`Serving on port ${port}`)
// })