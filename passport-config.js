const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { User } = require('./models/user');

// Passport configuration
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await User.findOne({ where: { username } });
            if (!user) return done(null, false, { message: 'Incorrect username.' });

            const match = await bcrypt.compare(password, user.password);
            if (!match) return done(null, false, { message: 'Incorrect password.' });

            return done(null, user);
        } catch (err) {
            return done(err);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.username);
});

passport.deserializeUser(async (username, done) => {
    try {
        const user = await User.findOne({ where: { username } });
        done(null, user);
    } catch (err) {
        done(err);
    }
});
