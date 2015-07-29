import bodyParser from 'body-parser'
import connectFlash from 'connect-flash'
import cookieParser from 'cookie-parser'
import eventToPromise from 'event-to-promise'
import express from 'express'
import expressSession from 'express-session'
import GitHubStrategy from 'passport-github2'
import minimist from 'minimist'
import passport from 'passport'
import {assign, find} from 'lodash'
import {load as loadConfig} from 'app-conf'
import {Strategy as LocalStrategy} from 'passport-local'

// -------------------------------------------------------------------

class Users {
  constructor () {
    this._users = Object.create(null)
  }

  getById (id) {
    return this._users[id]
  }

  getByName (name) {
    return find(this._users, user => user.name === name)
  }

  register (provider, id, name) {
    id = `${provider}:${id}`

    let user = this.getById(id)
    if (!user) {
      if (this.getByName(name)) {
        throw new Error(`the name ${name} is already taken`)
      }

      user = this._users[id] = {id, name}
    } else if (user.name !== name) {
      throw new Error(`name conflict ${name} != ${user.name}`)
    }

    return user
  }
}

const users = new Users()
assign(users.register('local', 'VntFCHMBWIvLahm', 'barbara.gordon'), {
  password: 'IAmBatgirl',
  age: 37
})
assign(users.register('local', 'GRXgFLzNNfKAM', 'bruce.wayne'), {
  password: 'IAmBatman',
  age: 45
})

// -------------------------------------------------------------------

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
    const user = users.getById(id)
    if (!user) {
      done('the user could not be found')
      return
    }

    done(null, user)
  })

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

  // Registers the GitHub strategy in Passport.
  passport.use(new GitHubStrategy(
    config.authProviders.github,
    (accessToken, refreshToken, profile, done) => {
      done(null, users.register('github', profile.id, profile.username))
    })
  )

  // Registers the GitHub strategy in Passport.
  app.get(
    '/signin/github',
    passport.authenticate('github', { scope: [ 'user:email' ] })
  )
  app.get(
    '/signin/github/callback',
    passport.authenticate('github', {
      successRedirect: '/',
      failureRedirect: '/',
      failureFlash: true
    })
  )

  // Registers the local strategy in Passport.
  passport.use(new LocalStrategy((name, password, done) => {
    const user = users.getByName(name)
    if (!user || user.password !== password) {
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
  app.post('/signin', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/',
    failureFlash: true
  }))

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
  if (config.staticFilesDir) {
    app.use(express.static(config.staticFilesDir))
  }

  // Creates an HTTP server and makes it listen.
  const server = app.listen(config.httpPort, () => {
    const { address: host, port } = server.address()

    console.log(`HTTP server listening at http://${host}:${port}`)
  })

  // Waits from the server to close before returning from this
  // function.
  await eventToPromise(server, 'close')
}
