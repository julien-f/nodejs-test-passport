import bodyParser from 'body-parser'
import connectFlash from 'connect-flash'
import cookieParser from 'cookie-parser'
import eventToPromise from 'event-to-promise'
import express from 'express'
import expressSession from 'express-session'
import minimist from 'minimist'
import passport from 'passport'
import {assign, find} from 'lodash'
import {load as loadConfig} from 'app-conf'
import {Strategy as LocalStrategy} from 'passport-local'

const users = [
  {
    id: 'VntFCHMBWIvLahm',
    name: 'barbara.gordon',
    password: 'IAmBatgirl',
    age: 37
  },
  {
    id: 'GRXgFLzNNfKAM',
    name: 'bruce.wayne',
    password: 'IAmBatman',
    age: 45
  }
]

export default async function (args) {
  // Parses the options from the command line arguments.
  const options = minimist(args)

  // Loads the configuration files.
  const config = await loadConfig('test-passport')

  // Overloads the configuration with the options.
  assign(config, options)

  // On each requests, Passport will serializes and deserializes
  // `user` to and from the session.
  passport.serializeUser((user, done) => {
    done(null, user.id)
  })
  passport.deserializeUser((id, done) => {
    const user = find(users, {id})
    if (!user) {
      done('the user could not be found')
      return
    }

    done(null, user)
  })

  // Registers the local strategy in passport.
  passport.use(new LocalStrategy((name, password, done) => {
    const user = find(users, {name, password})
    if (!user) {
      done(
        null,  // There were no errors during the authentication process.
        false, // But the user could not be authenticated.
        {
          message: 'invalid username or password'
        }
      )
      return
    }

    // The user has been authenticated, returns its record.
    done(null, user)
  }))

  // Creates the Express application.
  const app = express()

  // Registers the cookie-parser and express-session middlewares,
  // necessary for connect-flash.
  app.use(cookieParser())
  app.use(expressSession({
    resave: false,
    saveUninitialized: false,
    secret: config.sessionSecret
  }))

  // Registers the connect-flash middleware, necessary for Passport to
  // display error messages.
  app.use(connectFlash())

  // Registers the body-parser middleware, necessary for Passport to
  // access the username and password from the sign in form.
  app.use(bodyParser.urlencoded({ extended: false }))

  // Registers Passport's middlewares.
  app.use(passport.initialize())
  app.use(passport.session())

  // Registers the sign in form.
  app.get('/signin', (req, res) => {
    res.send(`
<html>
  <body>
    ${req.flash('error')}
    <form method="post">
      <input type="text" name="username">
      <input type="password" name="password">
      <input type="submit">
    </form>
  </body>
</html>
`)
  })

  // Registers the sign in handler.
  //
  // See http://passportjs.org/docs/authenticate
  app.post('/signin', passport.authenticate('local', {
    successRedirect: '/',
    // failureRedirect: '/signin',
    failureFlash: true
  }))

  // Prevents access to other pages if not signed in.
  app.use((req, res, next) => {
    if (!req.user) {
      res.redirect('/signin')
    } else {
      next()
    }
  })

  // This special route sign out the user.
  app.get('/signout', (req, res) => {
    req.logout()
    res.redirect('/')
  })

  // The main page simply displays the user's record.
  app.get('/', (req, res) => {
    res.send(`
<html>
  <body>
    <pre>${JSON.stringify(req.user, null, 2)}</pre>
    <a href="/signout"><button>Sign out</button></a>
  </body>
</html>
`)
  })

  // Configures static files (i.e. not transformed by the server)
  // serving.
  //
  // See http://expressjs.com/starter/static-files.html
  app.use(express.static(config.staticFilesDir))

  // Creates an HTTP server and makes it listen.
  const server = app.listen(config.httpPort, () => {
    const { address: host, port } = server.address()

    console.log(`HTTP server listening at http://${host}:${port}`)
  })

  // Waits from the server to close before returning from this
  // function.
  await eventToPromise(server, 'close')
}
